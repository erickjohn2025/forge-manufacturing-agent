export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/", "/objectives/:path*", "/configuration/:path*", "/approvals/:path*", "/procurement/:path*", "/messages/:path*", "/login"],
};
