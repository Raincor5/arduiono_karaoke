<template>
  <Karaoke />
</template>

<script setup lang="ts">
import Karaoke from './components/Karaoke.vue'
</script>

<style>
/* keep global layout minimal; main styling comes from the Karaoke component */
html, body, #app {
  height: 100%;
  margin: 0;
}
</style>
