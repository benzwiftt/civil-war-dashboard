/* Civil War - connection settings for the shared online database (Supabase).
 * The publishable key is meant to be public. NEVER put a "secret" or "service_role" key here.
 * useCloud only matters inside the Chrome extension: false = the extension still keeps its library in this browser.
 * (A normal website has no browser storage of the extension, so it always uses the shared database.) */
self.CW_CONFIG = {
  supabaseUrl: 'https://xbxkzuezrazfmeijafyk.supabase.co',
  supabaseKey: 'sb_publishable_3VAbPSYMD5QtFEUaZNkrjA_buIE4B7L',
  useCloud: false
};
