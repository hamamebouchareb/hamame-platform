-- PUT /api/users/me accepts explicit null on fullName to clear the field
-- (FR-4 profile editing), matching wilaya/facultyId/yearId. The column was
-- NOT NULL, so Prisma rejected the write with a validation error (500).
ALTER TABLE "users" ALTER COLUMN "full_name" DROP NOT NULL;
