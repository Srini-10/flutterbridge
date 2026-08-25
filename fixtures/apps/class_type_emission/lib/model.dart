/// A plain, project-defined class — used only in a type position elsewhere in this fixture, never
/// constructed, never member-accessed. Nothing about this class is special; it exists to be a real,
/// named type a generated TypeScript prop can honestly reference (ADR-0034).
class Model {}
