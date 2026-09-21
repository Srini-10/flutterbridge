// Why a project function or extension member could not be lowered.
//
// A function is attempted repeatedly until what it reaches has been emitted, and each failed attempt reports to a throwaway scope. The last
// error of the last attempt is what the developer needs next to "this function is not lowered", so it is kept here, by node id, and the
// reference-site diagnostic quotes it. Cleared at the start of each generation.

/** The last error message each function's own body produced, by node id. */
export const functionFailures = new Map<string, string>();
