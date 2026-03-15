import { client } from './drizzle';

const columnExistsCache: Record<string, boolean> = {};

export async function columnExists(table: string, column: string) {
	const key = `${table}.${column}`;
	if (key in columnExistsCache) return columnExistsCache[key];
	try {
		const res = await client`
			SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}
		`;
		const exists = Array.isArray(res) && res.length > 0;
		columnExistsCache[key] = exists;
		return exists;
	} catch (err) {
		// If checking fails, be conservative and return false so we fallback to legacy column
		columnExistsCache[key] = false;
		return false;
	}
}

export default { columnExists };



