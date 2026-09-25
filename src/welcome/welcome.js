// Shown once, right after SwiftSkip is installed (see background/core.js).

import { ext } from "../shared/ext.js";
import { LANGUAGE_NAMES, LANGUAGE_OPTIONS, localizePage, setLanguage, t } from "../shared/i18n.js";
import { radioGroup } from "../shared/radio-group.js";
import { loadSettings, saveSettings } from "../shared/storage.js";

let settings;

function render() {
  setLanguage(settings.language);
  localizePage();
  document.title = t("welcomePageTitle");
  radioGroup(
    document.getElementById("language-options"),
    LANGUAGE_OPTIONS,
    settings.language,
    (l) => (l === "auto" ? t("languageAuto") : LANGUAGE_NAMES[l]),
    (language) => {
      settings = { ...settings, language };
      saveSettings({ language });
      render();
    },
  );
}

document.getElementById("open-settings").addEventListener("click", () => ext.runtime.openOptionsPage());

loadSettings().then((loaded) => {
  settings = loaded;
  render();
});
