import type { VaccinationRecord } from "./types";

export interface VaccinationRow {
  id: string;
  pet_id: string;
  vaccine_name: string;
  administered_at: string | null;
  due_at: string | null;
  status: VaccinationRecord["status"];
  note: string | null;
  created_at: string;
  updated_at: string;
}

export const vaccinationSelectColumns =
  "id,pet_id,vaccine_name,administered_at,due_at,status,note,created_at,updated_at";

export function isMissingVaccinationTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    Boolean(maybeError.message?.includes("pet_vaccinations"))
  );
}

export function toVaccinationRecord(row: VaccinationRow): VaccinationRecord {
  return {
    id: row.id,
    petId: row.pet_id,
    name: row.vaccine_name,
    administeredAt: row.administered_at,
    dueAt: row.due_at,
    status: row.status,
    note: row.note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
