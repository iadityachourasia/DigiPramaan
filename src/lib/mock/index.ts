/**
 * Mock data barrel.
 *
 * Every export here matches the shape the real API is expected to return, so
 * swapping NEXT_PUBLIC_USE_MOCK_DATA to false is a change of data source and not a
 * change of component code. Nothing in this folder is imported by production paths
 * once the backend exists.
 */

export * from "./users";
export * from "./reference";
export * from "./jurisdictions";
export * from "./records";
export * from "./analytics";
export * from "./manufacturers";
export * from "./ecommerce";
export * from "./reports";
export * from "./grievances";
