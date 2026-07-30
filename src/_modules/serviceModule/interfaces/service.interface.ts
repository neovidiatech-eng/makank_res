import { CommissionType } from '@prisma/client';

export class CategoryDTO {
  id: number;
  name: string | Json;
}

export class ServiceSizeDTO {
  id: number;
  name: string | Json;
  // `price` stays the original, commission-inclusive price (what it would cost
  // without the sale). `effectivePrice` is what the customer actually pays.
  price: number;
  priceAfterDiscount: number | null;
  effectivePrice: number;
  hasDiscount: boolean;
  isDefault: boolean;
}

export class ServiceAddonDTO {
  id: number;
  name: string | Json;
  // Same discount shape as ServiceSizeDTO, but add-ons never receive store
  // commission (see OrderHelpersService.validateSizeAndAddons) — these are
  // raw values, not commission-inclusive.
  price: number;
  priceAfterDiscount: number | null;
  effectivePrice: number;
  hasDiscount: boolean;
}
export class StoreDTO {
  id: number;
  name: string | Json;
  cover: string;
  logo: string;
  rating: number;
  review: number;
  address?: string;
}

export class ServiceDTO {
  id: number;
  name: string | Json;
  description: string | Json;
  image: string;
  durationMinutes: number;
  commission: number;
  commissionType: CommissionType;
  // `price` stays the original, commission-inclusive price; `effectivePrice` is the
  // discounted, commission-inclusive headline price actually charged for the base.
  price: number;
  priceAfterDiscount: number | null;
  effectivePrice: number;
  hasDiscount: boolean;
  status: string;
  totalOrders: number;
  totalAmountSold: number;
  rating: number;
  review: number;
  bestRated: boolean;
  mostSeller: boolean;
  createdAt: Date;
  Category: CategoryDTO;
  Store: StoreDTO;
  Sizes: ServiceSizeDTO[];
  Addons: ServiceAddonDTO[];
  priceWithDefaultOptions: number;
  isFavourite: boolean;
  available: boolean;
}
