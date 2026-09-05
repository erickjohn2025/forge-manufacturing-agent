export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/objectives/:path*", "/configuration/:path*", "/login"],
};
