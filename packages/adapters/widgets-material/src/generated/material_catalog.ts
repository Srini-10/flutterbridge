// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/material.json by tools/catalog-codegen.
//
// Framework metadata is authored **once** and generated into both language domains (ADR-18). To change
// what the compiler knows about a widget, change the JSON.

import type { BridgePlugin, WidgetCatalog, WidgetSpec } from '@bridge/plugin-sdk';

const LIBRARY = "package:flutter/";

const WIDGETS: readonly WidgetSpec[] = [
  { name: "Text", library: LIBRARY },
  { name: "SelectableText", library: LIBRARY },
  { name: "FutureBuilder", library: LIBRARY },
  { name: "StreamBuilder", library: LIBRARY },
  { name: "Column", library: LIBRARY, childrenProp: "children" },
  { name: "Row", library: LIBRARY, childrenProp: "children" },
  { name: "Stack", library: LIBRARY, childrenProp: "children" },
  { name: "Wrap", library: LIBRARY, childrenProp: "children" },
  { name: "Flex", library: LIBRARY, childrenProp: "children" },
  { name: "ListView", library: LIBRARY, childrenProp: "children" },
  { name: "GridView", library: LIBRARY, childrenProp: "children" },
  { name: "ListBody", library: LIBRARY, childrenProp: "children" },
  { name: "ButtonBar", library: LIBRARY, childrenProp: "children" },
  { name: "OverflowBar", library: LIBRARY, childrenProp: "children" },
  { name: "TabBarView", library: LIBRARY, childrenProp: "children" },
  { name: "PageView", library: LIBRARY, childrenProp: "children" },
  { name: "Table", library: LIBRARY, childrenProp: "children" },
  { name: "CustomScrollView", library: LIBRARY, childrenProp: "slivers" },
  { name: "SliverList", library: LIBRARY, childrenProp: "children" },
  { name: "MultiSliver", library: LIBRARY, childrenProp: "children" },
  { name: "AppBar", library: LIBRARY, slots: ["title","leading","flexibleSpace","bottom"], childrenProp: "actions" },
  { name: "SliverAppBar", library: LIBRARY, slots: ["title","leading","flexibleSpace","bottom"], childrenProp: "actions" },
  { name: "Scaffold", library: LIBRARY, slots: ["appBar","body","bottomNavigationBar","bottomSheet","drawer","endDrawer","floatingActionButton"], childrenProp: "persistentFooterButtons" },
  { name: "ListTile", library: LIBRARY, slots: ["leading","title","subtitle","trailing"] },
  { name: "MaterialApp", library: LIBRARY, slots: ["home"] },
  { name: "CupertinoApp", library: LIBRARY, slots: ["home"] },
  { name: "WidgetsApp", library: LIBRARY, slots: ["home"] },
  { name: "Card", library: LIBRARY, slots: ["child"] },
  { name: "Dismissible", library: LIBRARY, slots: ["child","background","secondaryBackground"] },
  { name: "FloatingActionButton", library: LIBRARY, slots: ["child","icon","label"] },
  { name: "ElevatedButton", library: LIBRARY, slots: ["child"] },
  { name: "TextButton", library: LIBRARY, slots: ["child"] },
  { name: "OutlinedButton", library: LIBRARY, slots: ["child"] },
  { name: "IconButton", library: LIBRARY, slots: ["icon"] },
  { name: "Center", library: LIBRARY, slots: ["child"] },
  { name: "Align", library: LIBRARY, slots: ["child"] },
  { name: "Padding", library: LIBRARY, slots: ["child"] },
  { name: "Expanded", library: LIBRARY, slots: ["child"] },
  { name: "Flexible", library: LIBRARY, slots: ["child"] },
  { name: "Positioned", library: LIBRARY, slots: ["child"] },
  { name: "SafeArea", library: LIBRARY, slots: ["child"] },
  { name: "AspectRatio", library: LIBRARY, slots: ["child"] },
  { name: "FittedBox", library: LIBRARY, slots: ["child"] },
  { name: "ClipRRect", library: LIBRARY, slots: ["child"] },
  { name: "Opacity", library: LIBRARY, slots: ["child"] },
  { name: "Transform", library: LIBRARY, slots: ["child"] },
  { name: "GestureDetector", library: LIBRARY, slots: ["child"] },
  { name: "InkWell", library: LIBRARY, slots: ["child"] },
  { name: "Semantics", library: LIBRARY, slots: ["child"] },
  { name: "SingleChildScrollView", library: LIBRARY, slots: ["child"] },
  { name: "Form", library: LIBRARY, slots: ["child"] },
  { name: "PopScope", library: LIBRARY, slots: ["child"] },
  { name: "ListenableBuilder", library: LIBRARY, slots: ["child"] },
  { name: "ColoredBox", library: LIBRARY, slots: ["child"] },
  { name: "MergeSemantics", library: LIBRARY, slots: ["child"] },
  { name: "Container", library: LIBRARY, slots: ["child"], transparentWithoutProps: ["alignment","clipBehavior","color","constraints","decoration","foregroundDecoration","height","margin","padding","transform","transformAlignment","width"] },
  { name: "SizedBox", library: LIBRARY, slots: ["child"], transparentWithoutProps: ["width","height"] },
  { name: "DecoratedBox", library: LIBRARY, slots: ["child"], transparentWithoutProps: ["decoration"] },
  { name: "RepaintBoundary", library: LIBRARY, slots: ["child"], transparentWithoutProps: [] },
];

/** The material widget catalog. */
export const materialCatalog: WidgetCatalog = {
  name: "material",
  priority: 10,
  widgets: WIDGETS,
};

/** The plugin the compiler's host loads at runtime. */
export const materialWidgets: BridgePlugin = {
  name: '@bridge/widgets-material',
  version: '0.0.0',
  widgets: materialCatalog,
};

export default materialWidgets;
