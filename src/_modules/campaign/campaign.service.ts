import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignType, Prisma } from '@prisma/client';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { PrismaService } from 'src/globals/services/prisma.service';
import { RolesKeys } from '../authorization/providers/roles';
import { LanguagesService } from '../languages/languages.service';
import {
  CreateCampaignDTO,
  FilterCampaignDTO,
  UpdateCampaignDTO,
  UpdateCampaignStatusDTO,
} from './dto/campaign.dto';
import {
  deriveCampaignStatus,
  getCampaignArgs,
  getCampaignArgsWithSelect,
  selectActiveOfferOBJ,
} from './prisma-args/campaign.prisma.args';
import {
  CampaignDispatchResult,
  CampaignDispatchService,
} from './services/campaign-dispatch.service';

// Frequency cap applied when a campaign does not set displayIntervalHours.
// Marketing popups should not reappear on every app open, so an unset interval
// is treated as a once-per-day cap rather than "always show".
const DEFAULT_DISPLAY_INTERVAL_HOURS = 24;

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly Language: LanguagesService,
    private readonly dispatch: CampaignDispatchService,
  ) {}

  async create(body: CreateCampaignDTO) {
    const data = this.toPersistable(body);
    this.assertOfferImage(body.type, data.image);

    const campaign = await this.prisma.campaign.create({
      data: data as Prisma.CampaignUncheckedCreateInput,
    });

    // NOTIFICATION campaigns fan out to customers once, on creation. OFFER
    // campaigns never send push — dispatchForCampaign short-circuits on type.
    let dispatch: CampaignDispatchResult | undefined;
    if (campaign.type === CampaignType.NOTIFICATION) {
      dispatch = await this.dispatch.dispatchForCampaign(campaign.id);
    }

    return { campaign, dispatch };
  }

  async update(id: Id, body: UpdateCampaignDTO) {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');

    const data = this.toPersistable(body);
    // Validate against the effective type (post-update) and effective image.
    const effectiveType = (body.type ?? existing.type) as CampaignType;
    const effectiveImage =
      data.image !== undefined ? data.image : existing.image;
    this.assertOfferImage(effectiveType, effectiveImage);

    await this.prisma.campaign.update({
      where: { id },
      data: data as Prisma.CampaignUncheckedUpdateInput,
    });
  }

  async findAll(filters: FilterCampaignDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getCampaignArgs(filters, languages);
    const argsWithSelect = getCampaignArgsWithSelect();

    const data = await this.prisma.campaign[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });

    if (Array.isArray(data)) return data.map((c) => this.withStatus(c));
    return data ? this.withStatus(data) : data;
  }

  async count(filters: FilterCampaignDTO) {
    const languages = await this.Language.getCashedLanguages();
    const args = getCampaignArgs(filters, languages);
    return this.prisma.campaign.count({ where: args.where });
  }

  async updateStatus(id: Id, body: UpdateCampaignStatusDTO) {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    await this.prisma.campaign.update({
      where: { id },
      data: { manualStatus: body.manualStatus },
    });
  }

  async delete(id: Id): Promise<void> {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Campaign not found');
    // Global soft-delete middleware turns this into a deletedAt update.
    await this.prisma.campaign.delete({ where: { id } });
  }

  // --- customer popup offers ----------------------------------------------

  // Returns OFFER campaigns currently eligible to pop up for this customer:
  // active, within schedule window, targeting-matched, and "due" per the
  // per-user display interval. No push notifications are sent here.
  async getActiveOffers(currentUser: CurrentUser) {
    this.assertCustomer(currentUser);
    const userId = currentUser.id;
    const now = new Date();

    const offers = await this.prisma.campaign.findMany({
      where: {
        type: CampaignType.OFFER,
        manualStatus: 'ACTIVE',
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      select: selectActiveOfferOBJ(userId),
      orderBy: { startAt: 'desc' },
    });

    return offers
      .filter((offer) => this.matchesTarget(offer, userId))
      .filter((offer) => this.isDueForUser(offer, now))
      .map(({ Views, targetUserIds, targetType, ...rest }) => rest);
  }

  // Records that the popup was shown to this user, resetting the interval clock.
  async markViewed(id: Id, currentUser: CurrentUser) {
    this.assertCustomer(currentUser);
    const userId = currentUser.id;

    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.type !== CampaignType.OFFER) {
      throw new NotFoundException('Offer not found');
    }

    await this.prisma.campaignView.upsert({
      where: { campaignId_userId: { campaignId: id, userId } },
      create: { campaignId: id, userId },
      update: { lastShownAt: new Date(), viewCount: { increment: 1 } },
    });
  }

  // --- helpers -------------------------------------------------------------

  private assertCustomer(currentUser: CurrentUser) {
    if (currentUser?.Role?.roleKey !== RolesKeys.CUSTOMER) {
      throw new ForbiddenException('Only customers can access offers');
    }
  }

  // v1 audience targeting has exactly two modes:
  //   - SELECTED_USERS: reaches only the listed customers.
  //   - everything else (ALL, CUSTOMER, and also STORE/SERVICE): reaches every customer.
  // STORE/SERVICE do NOT restrict the audience in v1 — storeId/serviceId are
  // offer context / deep-link metadata only (see selectActiveOfferOBJ). Affinity
  // filtering from favorites/order history is intentionally out of scope.
  private matchesTarget(
    offer: { targetType: string; targetUserIds: Prisma.JsonValue },
    userId: Id,
  ) {
    if (offer.targetType !== 'SELECTED_USERS') return true;
    const ids = Array.isArray(offer.targetUserIds)
      ? (offer.targetUserIds as number[])
      : [];
    return ids.includes(userId);
  }

  // A never-shown offer is always due. Once shown, it is suppressed until the
  // display interval elapses. An unset interval defaults to a 24h cap so popups
  // do not reappear on every app open.
  private isDueForUser(
    offer: {
      displayIntervalHours: number | null;
      Views: { lastShownAt: Date }[];
    },
    now: Date,
  ) {
    const lastShownAt = offer.Views?.[0]?.lastShownAt;
    if (!lastShownAt) return true;
    const intervalHours =
      offer.displayIntervalHours ?? DEFAULT_DISPLAY_INTERVAL_HOURS;
    const nextEligible =
      new Date(lastShownAt).getTime() + intervalHours * 60 * 60 * 1000;
    return now.getTime() >= nextEligible;
  }

  // Strip undefined keys so PATCH only touches provided fields, and ignore
  // any stray dispatch-only columns the client cannot set.
  private toPersistable<T extends Partial<CreateCampaignDTO>>(body: T) {
    const {
      type,
      title,
      description,
      featureText,
      valueText,
      image,
      targetType,
      targetUserIds,
      storeId,
      serviceId,
      deliveryId,
      startAt,
      endAt,
      displayIntervalHours,
    } = body;

    const data: Record<string, unknown> = {};
    if (type !== undefined) data.type = type;
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (featureText !== undefined) data.featureText = featureText;
    if (valueText !== undefined) data.valueText = valueText;
    if (image !== undefined) data.image = image;
    if (targetType !== undefined) data.targetType = targetType;
    if (targetUserIds !== undefined) data.targetUserIds = targetUserIds;
    if (storeId !== undefined) data.storeId = storeId;
    if (serviceId !== undefined) data.serviceId = serviceId;
    if (deliveryId !== undefined) data.deliveryId = deliveryId;
    if (startAt !== undefined) data.startAt = startAt;
    if (endAt !== undefined) data.endAt = endAt;
    if (displayIntervalHours !== undefined)
      data.displayIntervalHours = displayIntervalHours;
    return data as Record<string, unknown> & { image?: string };
  }

  private assertOfferImage(type: CampaignType | undefined, image: unknown) {
    if (type === CampaignType.OFFER && !image) {
      throw new BadRequestException('image is required for OFFER campaigns');
    }
  }

  private withStatus<T extends { manualStatus: any; startAt: any; endAt: any }>(
    campaign: T,
  ) {
    return { ...campaign, status: deriveCampaignStatus(campaign) };
  }
}
