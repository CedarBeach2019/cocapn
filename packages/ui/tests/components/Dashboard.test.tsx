import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "../src/components/Dashboard.js";
import { BridgeProvider } from "../src/contexts/BridgeContext.js";

// Mock bridge
const mockBridge = {
  status: "connected",
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  request: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  queueLength: 0,
};

vi.mock("../src/hooks/useBridge.js", () => ({
  useBridge: () => mockBridge,
}));

function renderWithBridge(ui: React.ReactElement) {
  return render(<BridgeProvider>{ui}</BridgeProvider>);
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge.request.mockResolvedValue({ uptime: 3600000 });
  });

  it("renders dashboard header with uptime", () => {
    renderWithBridge(<Dashboard />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText(/Uptime:/)).toBeInTheDocument();
  });

  it("renders all panels", () => {
    renderWithBridge(<Dashboard />);
    expect(screen.getByText("Cloud Connection")).toBeInTheDocument();
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    expect(screen.getByText("Token Usage (24h)")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Graph")).toBeInTheDocument();
    expect(screen.getByText("Tree Search")).toBeInTheDocument();
  });

  it("renders quick action buttons", () => {
    renderWithBridge(<Dashboard />);
    expect(screen.getByText("Sync Repo")).toBeInTheDocument();
    expect(screen.getByText("Export Knowledge")).toBeInTheDocument();
    expect(screen.getByText("Refresh Skills")).toBeInTheDocument();
  });

  it("handles quick action clicks", async () => {
    mockBridge.request.mockResolvedValue({});
    renderWithBridge(<Dashboard />);

    const syncButton = screen.getByText("Sync Repo");
    syncButton.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockBridge.request).toHaveBeenCalledWith("bridge/sync");
  });

  it("formats uptime correctly", () => {
    mockBridge.request.mockResolvedValue({ uptime: 90061000 }); // 1d 1h 1m
    renderWithBridge(<Dashboard />);
    expect(screen.getByText(/Uptime:/)).toBeInTheDocument();
  });
});
