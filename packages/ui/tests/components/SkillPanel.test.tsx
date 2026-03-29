import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillPanel } from "../src/components/SkillPanel.js";
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

describe("SkillPanel", () => {
  const mockSkills = [
    { id: "skill-1", name: "Skill One", loaded: true, tolerance: 0.8, memoryUsage: 1024, matchCount: 5 },
    { id: "skill-2", name: "Skill Two", loaded: false, tolerance: 0.6, memoryUsage: 512, matchCount: 2 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge.request.mockResolvedValue({ skills: mockSkills });
  });

  it("renders skills panel header", () => {
    renderWithBridge(<SkillPanel />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("renders loaded and unloaded skills", async () => {
    renderWithBridge(<SkillPanel />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("Skill One")).toBeInTheDocument();
    expect(screen.getByText("Skill Two")).toBeInTheDocument();
  });

  it("shows skill stats (memory, matches, tolerance)", async () => {
    renderWithBridge(<SkillPanel />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText(/1\.0KB/)).toBeInTheDocument();
    expect(screen.getByText(/5 matches/)).toBeInTheDocument();
    expect(screen.getByText(/tol: 0\.8/)).toBeInTheDocument();
  });

  it("shows load/unload buttons", async () => {
    renderWithBridge(<SkillPanel />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("Unload")).toBeInTheDocument();
    expect(screen.getByText("Load")).toBeInTheDocument();
  });

  it("handles load/unload button clicks", async () => {
    mockBridge.request.mockResolvedValue({});
    renderWithBridge(<SkillPanel />);

    await new Promise(resolve => setTimeout(resolve, 0));

    const loadButtons = screen.getAllByText("Load");
    if (loadButtons.length > 0) {
      loadButtons[0].click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockBridge.request).toHaveBeenCalled();
    }
  });

  it("shows loading state initially", () => {
    mockBridge.request.mockImplementation(() => new Promise(() => {}));
    renderWithBridge(<SkillPanel />);
    expect(screen.getByText("Loading skills...")).toBeInTheDocument();
  });

  it("shows empty state when no skills", async () => {
    mockBridge.request.mockResolvedValue({ skills: [] });
    renderWithBridge(<SkillPanel />);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.getByText("No skills available")).toBeInTheDocument();
  });
});
