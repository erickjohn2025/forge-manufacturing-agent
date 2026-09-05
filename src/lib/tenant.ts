import { auth } from "@/auth";
import { ApiError } from "@/lib/http";

export type TenantSession = {
  userId: string;
  businessId: string;
  role: "ADMIN" | "OPERATOR" | "APPROVER";
};

export async function requireTenant(roles?: TenantSession["role"][]): Promise<TenantSession> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.businessId || !user.role) throw new ApiError(401, "Authentication required");
  if (roles && !roles.includes(user.role)) throw new ApiError(403, "Insufficient role");
  return { userId: user.id, businessId: user.businessId, role: user.role };
}
