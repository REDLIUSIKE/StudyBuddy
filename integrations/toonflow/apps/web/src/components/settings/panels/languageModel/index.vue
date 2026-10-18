<template>
  <studyBuddyModels kind="text" :visible="visible" />
</template>

<script setup lang="ts">
import studyBuddyModels from "../studyBuddyModels.vue";
const { visible = true } = defineProps<{ visible?: boolean }>();
</script>
