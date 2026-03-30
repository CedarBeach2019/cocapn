import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TokenChart } from "../src/components/TokenChart.js";
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

describe("TokenChart", () => {
  const mockTokenStats = {
    stats: [
      { module: "chat", tokens: 15000, cost: 0.03 },
      { module: "code", tokens: 8000, cost: 0.016 },
      { module: "search", tokens: 5000, cost: 0.01 },
    ],
    period: "24h",
  };

  const mockEfficiency = {
    trend: [
      { timestamp: Date.now() - 20000, efficiency: 100 },
      { timestamp: Date.now() - 10000, efficiency: 95 },
      { timestamp: Date.now(), efficiency: 98 },
    ],
    currentCost: 0.056,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge.request.mockImplementation((method) => {
      if (method === "tokens/stats") return Promise.resolve(mockTokenStats);
      if (method === "tokens/efficiency") return Promise.resolve(mockEfficiency);
      return Promise.resolve({});
    });
  });

  it("renders token chart header", () => {
    renderWithBridge(<TokenChart />);
    expect(screen.getByText("Token Usage (24h)")).toBeInTheDocument();
  });

  it("renders token bars for each module", async () => {
    renderWithBridge(<TokenChart />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("chat")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
  });

  it("displays token counts", async () => {
    renderWithBridge(<TokenChart />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/15,000 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/8,000 tokens/)).toBeInTheDocument();
    expect(screen.getByText(/5,000 tokens/)).toBeInTheDocument();
  });

  it("displays estimated cost", async () => {
    renderWithBridge(<TokenChart />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/Est\. cost: \$0\.0560/)).toBeInTheDocument();
  });

  it("renders efficiency trend", async () => {
    renderWithBridge(<TokenChart />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("Efficiency Trend")).toBeInTheDocument();
  });

  it("shows empty state when no data", async () => {
    mockBridge.request.mockResolvedValue({ stats: [] });
    renderWithBridge(<TokenChart />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("No token usage data")).toBeInTheDocument();
  });
});
