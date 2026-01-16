import { v4 as uuidv4 } from 'uuid';
export function getOrCreateStoreId() {
  let storeId = localStorage.getItem('store_id');
  if (!storeId) {
    storeId = uuidv4();
    localStorage.setItem('store_id', storeId);
  }
  return storeId;
}
