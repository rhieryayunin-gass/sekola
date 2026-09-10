import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";
describe("Collection pagination", () => {
  it("disables invalid pages and requests the next page", () => {
    const onPage=vi.fn(); render(<Pagination page={1} count={50} onPage={onPage}/>);
    expect(screen.getByText("Previous")).toBeDisabled(); fireEvent.click(screen.getByText("Next")); expect(onPage).toHaveBeenCalledWith(2);
  });
});
