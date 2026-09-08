import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "./i18n-provider";
import { LanguageSwitcher } from "./language-switcher";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe("LanguageSwitcher", () => { it("renders both supported locales", () => { render(<I18nProvider locale="id-ID"><LanguageSwitcher /></I18nProvider>); expect(screen.getByRole("option", { name: "Bahasa Indonesia" })).toBeInTheDocument(); expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument(); }); });
