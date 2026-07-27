declare global {
  interface Field {
    colName: string;
    colType: string;
    allowNull: boolean;
    unique: boolean;
    isId: boolean;
    defaultValue: any;
  }

  interface Model {
    name: string;
    cols: Field[];
  }

  type PrismaTransaction = Omit<
    PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >;

  type SchemeObject = Model[];
}
export {};
