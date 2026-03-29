import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CloudStatus } from "../src/components/CloudStatus.js";
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

describe("CloudStatus", () => {
  const mockCloudStatus = {
    connected: true,
    latency: 45,
    tasksQueued: 3,
    tasksCompleted: 127,
    lastHeartbeat: Date.now(),
    workerHealth: "healthy" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge.request.mockResolvedValue(mockCloudStatus);
  });

  it("renders cloud connection header", () => {
    renderWithBridge(<CloudStatus />);
    expect(screen.getByText("Cloud Connection")).toBeInTheDocument();
  });

  it("displays connected status when connected", async () => {
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("displays health status", async () => {
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("displays latency", async () => {
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/45ms/)).toBeInTheDocument();
  });

  it("displays task counts", async () => {
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/3 queued \/ 127 completed/)).toBeInTheDocument();
  });

  it("displays last heartbeat time", async () => {
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/Last heartbeat:/)).toBeInTheDocument();
  });

  it("shows disconnected status when not connected", async () => {
    mockBridge.request.mockResolvedValue({ ...mockCloudStatus, connected: false });
    renderWithBridge(<CloudStatus />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("shows no connection message when null status", () => {
    mockBridge.request.mockResolvedValue(null);
    renderWithBridge(<CloudStatus />);
    expect(screen.getByText("No cloud connection")).toBeInTheDocument();
  });
});
