// tools/index.mjs
// Centralized export file for all LangGraph compatible tools

export { createBookSearchTool } from './booksearch.js';
export { createCourseBookSearchTool } from './coursebooksearch.js';
export { createDatabaseSearchTool } from './databasesearch.js';
export { createWebDocSearchTool } from './webdocsearch.js';
export { createDocumentSearchTool } from './createDocumentSearchTool.mjs';

// Default export for convenience
export const createAllTools = (chatModel, documentProcessor) => {
  return {
    get_books: createBookSearchTool(),
    get_course_books: createCourseBookSearchTool(),
    get_library_databases: createDatabaseSearchTool(),
    get_databases_from_web: createWebDocSearchTool(chatModel, documentProcessor),
    get_information_from_documents: createDocumentSearchTool(documentProcessor, chatModel),
  };
};

export default createAllTools;

