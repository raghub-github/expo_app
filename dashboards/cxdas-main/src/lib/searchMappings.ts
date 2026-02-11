export type SearchCategory = "Food" | "Parcel" | "Person";

export type SearchBy =
  | "User ID"
  | "Mobile No"
  | "Email ID"
  | "Customer Name";

export function getTableForCategory(category: SearchCategory): string {
  // All categories map to the single 'users' table
  return "users";
}

export function getColumnForSearchBy(searchBy: SearchBy): string {
  switch (searchBy) {
    case "User ID":
      return "user_id";
    case "Mobile No":
      return "user_number";
    case "Email ID":
      return "email";
    case "Customer Name":
      return "name";
    default:
      throw new Error(`Unsupported searchBy: ${searchBy}`);
  }
}
