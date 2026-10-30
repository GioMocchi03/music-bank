type WebAudioPlayer = {
  media?: HTMLAudioElement;
  src?: unknown;
  sourceNode?: MediaElementAudioSourceNode | null;
  playing?: boolean;
  replace?: (source: unknown) => void;
  seekTo?: (seconds: number) => Promise<void>;
  play?: () => void;
  __musicBankEq?: {
    context: AudioContext;
    media: HTMLAudioElement;
    filters: BiquadFilterNode[];
  };
};

const DEFAULT_FREQUENCIES = [60, 230, 910, 3600, 14000];

export function configureWebEqualizer(
  player: unknown,
  enabled: boolean,
  levels: number[],
  frequencies = DEFAULT_FREQUENCIES,
): boolean {
  if (typeof window === 'undefined') return false;
  const target = player as WebAudioPlayer;
  const media = target.media;
  if (!media) return false;

  try {
    let graph = target.__musicBankEq;
    if (!enabled) {
      if (!graph) return true;
      const position = media.currentTime;
      const wasPlaying = !!target.playing;
      const source = target.src;
      graph.filters.forEach((filter) => filter.disconnect());
      target.sourceNode?.disconnect();
      target.sourceNode = null;
      delete target.__musicBankEq;
      if (source && target.replace && target.seekTo) {
        target.replace(source);
        void target.seekTo(position).then(() => {
          if (wasPlaying) target.play?.();
        });
      }
      return true;
    }
    if (!graph || graph.media !== media) {
      graph?.filters.forEach((filter) => filter.disconnect());
      const AudioContextClass = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return false;
      const context = graph?.context ?? new AudioContextClass();
      const source = context.createMediaElementSource(media);
      target.sourceNode = source;
      const filters = frequencies.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        return filter;
      });
      source.connect(filters[0]);
      filters.forEach((filter, index) => filter.connect(filters[index + 1] ?? context.destination));
      graph = { context, media, filters };
      target.__musicBankEq = graph;
    }

    if (graph.context.state === 'suspended') void graph.context.resume();
    graph.filters.forEach((filter, index) => {
      filter.gain.value = (levels[index] ?? 0) / 100;
    });
    return true;
  } catch {
    return false;
  }
}
