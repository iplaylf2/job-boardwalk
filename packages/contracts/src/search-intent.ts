export interface TargetLocation {
  city: string;
  id: number;
  priority: number;
  requirement: "preferred" | "required";
  updatedAt: string;
}
