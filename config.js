/* Civil War - connection settings for the shared online database (Supabase).
 * The publishable key is meant to be public. NEVER put a "secret" or "service_role" key here.
 * useCloud only matters inside the Chrome extension: true = the extension reads and saves the library in the shared database;
 * false = it uses this browser's own library again (your old data is never deleted, so you can switch back any time).
 * (A normal website has no browser storage of the extension, so it always uses the shared database.) */
self.CW_CONFIG = {
  supabaseUrl: 'https://xbxkzuezrazfmeijafyk.supabase.co',
  supabaseKey: 'sb_publishable_3VAbPSYMD5QtFEUaZNkrjA_buIE4B7L',
  useCloud: true,
  // the live website; the side panel buttons open it while useCloud is true (with useCloud false they open the pages inside the extension again)
  siteUrl: 'https://benzwiftt.github.io/civil-war-dashboard/'
};
