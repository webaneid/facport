import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { InternalBadge } from "./internal-badge";

describe("InternalBadge", () => {
  test("flag → 'Internal'; role admin/staf → 'Internal · admin'; komersil → tidak ada lencana", () => {
    const { rerender, container } = render(<InternalBadge reason="flag" />);
    expect(screen.getByText("Internal")).toBeTruthy();
    rerender(<InternalBadge reason="role" />);
    expect(screen.getByText("Internal · admin")).toBeTruthy();
    rerender(<InternalBadge reason={null} />);
    expect(container.textContent).toBe("");
    rerender(<InternalBadge reason={undefined} />);
    expect(container.textContent).toBe("");
  });
});
