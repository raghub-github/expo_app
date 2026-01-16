import { supabase } from './supabase';

export interface AreaManager {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  region: string;
  status: 'active' | 'inactive';
  stores: string[];
}

export const fetchAllManagers = async (): Promise<AreaManager[]> => {
  const { data, error } = await supabase
    .from('merchant_area_managers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    if (typeof error === 'object') {
      console.error('Error fetching managers:', JSON.stringify(error));
    } else {
      console.error('Error fetching managers:', error);
    }
    return [];
  }
  return data || [];
};

export const createManager = async (manager: Partial<AreaManager>): Promise<boolean> => {
  // Auto-generate manager_id in format GMMA1001, GMMA1002, ...
  const { name, email, mobile, alternate_mobile, region, cities, postal_codes, status } = manager;
  // Ensure cities and postal_codes are arrays
  const citiesArr = Array.isArray(cities)
    ? cities
    : typeof cities === 'string' && cities.length > 0
      ? cities.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];
  const postalCodesArr = Array.isArray(postal_codes)
    ? postal_codes
    : typeof postal_codes === 'string' && postal_codes.length > 0
      ? postal_codes.split(',').map((p: string) => p.trim()).filter(Boolean)
      : [];
  // Fetch latest manager_id
  const { data: latestData, error: latestError } = await supabase
    .from('merchant_area_managers')
    .select('manager_id')
    .order('id', { ascending: false })
    .limit(1);
  let nextSeq = 1001;
  if (latestData && latestData.length > 0 && latestData[0].manager_id) {
    const match = latestData[0].manager_id.match(/GMMA(\d+)/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }
  const manager_id = `GMMA${nextSeq}`;
  const { error } = await supabase
    .from('merchant_area_managers')
    .insert([{ manager_id, name, email, mobile, alternate_mobile, region, cities: citiesArr, postal_codes: postalCodesArr, status }]);
  if (error) {
    console.error('Error creating manager:', error?.message || error, error?.details || '', error?.hint || '');
    return false;
  }
  return true;
};

export const updateManager = async (id: string, updates: Partial<AreaManager>): Promise<boolean> => {
  const { error } = await supabase
    .from('merchant_area_managers')
    .update(updates)
    .eq('id', id);
  if (error) {
    console.error('Error updating manager:', error);
    return false;
  }
  return true;
};

export const deleteManager = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('merchant_area_managers')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting manager:', error);
    return false;
  }
  return true;
};
