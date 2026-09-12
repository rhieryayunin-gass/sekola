"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "../../stores/auth-store";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { useTranslations } from "../i18n/i18n-provider";

export function LogoutButton({ danger = false }: { danger?: boolean }) {
  const { t } = useTranslations();
  const router = useRouter();
  const signOut = useAuthStore((state) => state.signOut);
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);

    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      toast({
        description: "Please retry. Your current page remains protected.",
        title: "Unable to sign out",
        tone: "error",
      });
      setIsPending(false);
    }
  }

  return (
    <Button disabled={isPending} onClick={handleLogout} variant={danger ? "danger" : "ghost"}>
      {isPending ? t("signingOut") : t("signOut")}
    </Button>
  );
}
