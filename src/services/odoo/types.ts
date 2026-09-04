export type OdooProduct = {
  id: number;
  name: string;
  list_price: number;
  qty_available: number;
  default_code?: string;
};

export type OdooSaleOrderLine = {
  productName: string;
  qty: number;
  priceUnit: number;
  subtotal: number;
};

export type OdooSaleOrder = {
  id: number;
  name: string;
  state: string;
  amount_total: number;
  partner_id?: [number, string];
  date_order?: string;
  access_token?: string;
  lines?: OdooSaleOrderLine[];
  invoice_status?: string;
  note?: string;
};

export type OdooDailySalesItem = {
  product: string;
  stock: number;
  salesYesterday: number;
  revenueYesterday: number;
};

export type OdooServiceItem = {
  id: number;
  name: string;
  default_code?: string;
  list_price: number;
  qty_available: number;
};

export type OdooPartner = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
};
