"use client";

import { signOut } from "next-auth/react";
import { LogoutIcon } from "./icons";

export function SignOutButton() {
  return <button className="icon-button" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Sign out" title="Sign out"><LogoutIcon /></button>;
}
