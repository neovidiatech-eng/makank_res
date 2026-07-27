export class MapOfSet<T> {
  private groups: Map<string | Id, Set<T>> = new Map();

  addItemToGroup(groupKey: string | Id, item: T): void {
    if (!this.groups.has(groupKey)) {
      this.groups.set(groupKey, new Set<T>());
    }
    this.groups.get(groupKey)?.add(item);
  }

  removeItemFromGroup(
    groupKey: string,
    predicate: (item: T) => boolean,
  ): boolean {
    const group = this.groups.get(groupKey);
    if (!group) return false;

    const itemToRemove = Array.from(group).find(predicate);
    if (itemToRemove) {
      group.delete(itemToRemove);
      return true;
    }
    return false;
  }

  isItemInGroup(groupKey: string, predicate: (item: T) => boolean): boolean {
    const group = this.groups.get(groupKey);
    return group ? Array.from(group).some(predicate) : false;
  }

  getItemsInGroup(groupKey: string | Id): T[] {
    const group = this.groups.get(groupKey);
    return group ? Array.from(group) : [];
  }

  getAllGroupKeys(): (string | Id)[] {
    return Array.from(this.groups.keys());
  }

  clearGroup(groupKey: string): void {
    this.groups.delete(groupKey);
  }

  clearAllGroups(): void {
    this.groups.clear();
  }
}
