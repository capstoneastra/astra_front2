// The astra theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in astra.settings.json and the generated astra.settings.ts;
// change them with `astryx experimental theme editor set astra ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {astraSettings} from './astra.settings';

export const astraTheme = defineTheme({
  extends: astraSettings,
  name: 'astra',
});
