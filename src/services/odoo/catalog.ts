export {
  createServiceCatalogItem,
  deleteServiceCatalogItem,
  findProductByQuery,
  findProductsByQuery,
  getProductById,
  getServiceByIdentifier,
  listProducts,
  listServiceCatalogItems,
  updateServiceCatalogItem,
} from '../odoo';
export type { OdooProduct, OdooServiceItem } from './types';
