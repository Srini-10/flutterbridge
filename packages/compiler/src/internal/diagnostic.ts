// A finding.
//
// Its own module, because both the pass contract and the widget registry produce one — and if either
// imported the other for the type, the two would be circular. A shared vocabulary belongs beneath the
// things that share it, not inside one of them.

/** A finding a pass or the registry reports. Neither throws for anything the input did. */
export interface Diagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly nodeId?: string;
}
