"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "../layout/brand";
import { LoginForm } from "./login-form";
import { useTranslations } from "../i18n/i18n-provider";
export function LoginScreen() {
  const { t } = useTranslations();
  return <main id="ose-main" className="ose-login"><section className="ose-login-panel glass-panel"><Link className="owner-back-home" href="/"><ArrowLeft size={17}/>{t("ownerBackHome")}</Link><Brand full/><h1>{t("welcomeBack")}</h1><p>{t("loginHelp")}</p><LoginForm/><p className="ose-login-foot">{t("loginFoot")}</p></section></main>;
}
