import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/i18n-provider";
import { ModuleShowcase } from "./module-showcase";
import { MarketingFaq } from "./marketing-faq";
import { marketingModules } from "../../lib/marketing";

// Next's image loader is irrelevant to the keyboard and disclosure contract.
vi.mock("next/image", () => ({ default: () => null }));

describe("Part 6 marketing interactions", () => {
  it("expands on keyboard focus and opens each original module through its existing callback", () => {
    const select = vi.fn();
    render(<I18nProvider locale="en-US"><ModuleShowcase onSelect={select}/></I18nProvider>);
    const buttons = screen.getAllByRole("button");
    fireEvent.focus(buttons[0]);
    expect(buttons[0]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1]).toHaveAttribute("data-active", "true");
    fireEvent.keyDown(buttons[1], { key: "End" });
    expect(buttons[7]).toHaveFocus();
    fireEvent.keyDown(buttons[7], { key: "ArrowRight" });
    expect(buttons[0]).toHaveFocus();
    buttons.forEach((button, index) => {
      fireEvent.click(button);
      expect(select).toHaveBeenLastCalledWith(marketingModules[index]);
      expect(button).toHaveAttribute("aria-haspopup", "dialog");
    });
  });

  it("provides eight translated FAQ disclosures and preserves the open answer when language changes", () => {
    const { rerender } = render(<I18nProvider locale="en-US"><MarketingFaq/></I18nProvider>);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    const start = screen.getByRole("button", { name: "How do we get started?" });
    fireEvent.click(start);
    expect(start).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "How do we get started?" })).toHaveTextContent("Book a free demo");
    rerender(<I18nProvider locale="id-ID"><MarketingFaq/></I18nProvider>);
    expect(screen.getByRole("region", { name: "Bagaimana cara mulai menggunakan OSEKOLA?" })).toHaveTextContent("Jadwalkan demo gratis");
    const payment = screen.getByRole("button", { name: "Bisakah orang tua membayar tagihan sekolah secara online?" });
    fireEvent.click(payment);
    expect(screen.queryByRole("region", { name: "Bagaimana cara mulai menggunakan OSEKOLA?" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Bisakah orang tua membayar tagihan sekolah secara online?" })).toHaveTextContent("setelah sekolah mengaktifkan");
    fireEvent.click(payment);
    expect(screen.queryByRole("region", { name: "Bisakah orang tua membayar tagihan sekolah secara online?" })).not.toBeInTheDocument();
  });
});
