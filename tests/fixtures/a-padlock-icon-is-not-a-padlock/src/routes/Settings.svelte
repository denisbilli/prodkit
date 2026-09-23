<script lang="ts">
  import { mdiTwoFactorAuthentication, mdiShareVariant } from '@mdi/js';
  import SettingAccordion from './SettingAccordion.svelte';
</script>

<SettingAccordion icon={mdiTwoFactorAuthentication} title="OAuth" subtitle="Manage your OAuth connection" />
<SettingAccordion icon={mdiShareVariant} title="Sharing" subtitle="Shared links" />
