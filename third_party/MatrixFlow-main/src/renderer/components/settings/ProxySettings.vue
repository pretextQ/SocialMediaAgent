<template>
  <div class="proxy-settings">
    <ProxyPoolSettings />
  </div>
</template>

<script setup lang="ts">
import ProxyPoolSettings from './ProxyPoolSettings.vue';
</script>

<style scoped>
.proxy-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>