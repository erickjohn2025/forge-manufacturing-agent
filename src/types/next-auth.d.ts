import "next-auth";

declare module "next-auth" {
  interface User {
    businessId: string;
    businessName?: string;
    role: "ADMIN" | "OPERATOR" | "APPROVER";
  }

  interface Session {
    user: User & {
      id: string;
      email: string;
      name?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    businessId?: string;
    businessName?: string;
    role?: "ADMIN" | "OPERATOR" | "APPROVER";
  }
}
