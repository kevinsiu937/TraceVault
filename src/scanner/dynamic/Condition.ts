/** Values an earlier step of the same match remembered, by binding name. */
export type Bindings = ReadonlyMap<string, string>;

/** A test on one fact of an event. A fact the event does not have arrives as null. */
export interface Condition {
  matches(value: string | null, bound: Bindings): boolean;
}

/**
 * Turns the argument written in a rule file into a condition, or throws a
 * message saying why the argument is unusable. The loader adds file and field.
 */
export type ConditionParser = (argument: unknown) => Condition;
