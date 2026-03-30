const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

class CocapnTreeItem extends vscode.TreeItem {
  constructor(label, collapsibleState, icon, command) {
    super(label, collapsibleState);
    this.iconPath = icon ? new vscode.ThemeIcon(icon) : undefined;
    if (command) {
      this.command = command;
      this.tooltip = label;
    }
  }
}

class CocapnTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) {
      return this._getChildrenOf(element);
    }
    return this._getRootItems();
  }

  _getRootItems() {
    return [
      new CocapnTreeItem("Brain", vscode.TreeItemCollapsibleState.Collapsed, "brain"),
      new CocapnTreeItem("Status", vscode.TreeItemCollapsibleState.Collapsed, "activity-bar"),
      new CocapnTreeItem("Fleet", vscode.TreeItemCollapsibleState.Collapsed, "remote"),
    ];
  }

  _getChildrenOf(element) {
    const label = element.label;
    if (label === "Brain") {
      return [
        new CocapnTreeItem("Facts", vscode.TreeItemCollapsibleState.None, "symbol-variable", {
          command: "cocapn.openFile",
          title: "Open Facts",
          arguments: ["memory/facts.json"],
        }),
        new CocapnTreeItem("Memories", vscode.TreeItemCollapsibleState.None, "symbol-file", {
          command: "cocapn.openFile",
          title: "Open Memories",
          arguments: ["memory/memories.json"],
        }),
        new CocapnTreeItem("Wiki", vscode.TreeItemCollapsibleState.None, "book", {
          command: "cocapn.openFile",
          title: "Open Wiki",
          arguments: ["wiki/"],
        }),
        new CocapnTreeItem("Soul", vscode.TreeItemCollapsibleState.None, "heart", {
          command: "cocapn.openFile",
          title: "Open Soul",
          arguments: ["soul.md"],
        }),
        new CocapnTreeItem("Procedures", vscode.TreeItemCollapsibleState.None, "list-ordered", {
          command: "cocapn.openFile",
          title: "Open Procedures",
          arguments: ["memory/procedures.json"],
        }),
        new CocapnTreeItem("Relationships", vscode.TreeItemCollapsibleState.None, "git-merge", {
          command: "cocapn.openFile",
          title: "Open Relationships",
          arguments: ["memory/relationships.json"],
        }),
      ];
    }

    if (label === "Status") {
      return [
        new CocapnTreeItem("Cocapn: Status", vscode.TreeItemCollapsibleState.None, "info", {
          command: "cocapn.status",
          title: "Show Status",
        }),
      ];
    }

    if (label === "Fleet") {
      return [
        new CocapnTreeItem("No fleet agents connected", vscode.TreeItemCollapsibleState.None, "remote"),
      ];
    }

    return [];
  }
}

module.exports = { CocapnTreeProvider };
