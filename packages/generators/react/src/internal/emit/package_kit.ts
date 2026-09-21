// Package classes the runtime kit provides — the library-adapter table (ADR-0075).
//
// A package with a browser equivalent is mapped by a runtime class of the same name and shape (`Dio` → `fetch`), and this table is the whole of what
// the generator needs to know: which package classes exist in the kit. It is keyed by the class's *resolved library* (never a spelling), so a project's
// own `Dio` is untouched. With an entry, a class is imported from the kit like any framework value type; its named arguments become one trailing options
// object (the kit's convention, see `runtime.ts`); a member read of it is a property of the runtime class; and a `catch` clause naming it is `instanceof`.

/** `package name → Dart class name → the runtime export that mirrors it`. */
export const KIT_PACKAGE_CLASSES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  dio: {
    Dio: 'Dio',
    BaseOptions: 'BaseOptions',
    Options: 'Options',
    Response: 'Response',
    DioException: 'DioException',
    DioExceptionType: 'DioExceptionType',
    LogInterceptor: 'LogInterceptor',
  },
};

/** The runtime export mirroring `name` from `library`, if the kit provides it. */
export function kitPackageClass(library: unknown, name: unknown): string | undefined {
  if (typeof library !== 'string' || typeof name !== 'string' || !library.startsWith('package:')) return undefined;
  const pkg = library.slice('package:'.length).split('/')[0] as string;
  const classes = Object.hasOwn(KIT_PACKAGE_CLASSES, pkg) ? KIT_PACKAGE_CLASSES[pkg] : undefined;
  const bare = name.replace(/\?$/, '').split('<')[0] as string;
  return classes !== undefined && Object.hasOwn(classes, bare) ? classes[bare] : undefined;
}
