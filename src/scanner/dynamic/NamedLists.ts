/** Lists that several rules share, by name, such as `sensitive-paths`. */
export class NamedLists {
  constructor(private readonly lists: ReadonlyMap<string, readonly string[]>) {}

  items(name: string): readonly string[] | undefined {
    return this.lists.get(name);
  }
}
