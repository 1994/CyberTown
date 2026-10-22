import { districtAt } from '../../shared/townPlan';
import { rt } from '../world/runtime';
import { useEffect, useRef, useState } from 'react';
import { sound } from '../audio.ts';
import type { MusicScene, TeaSoundCue } from '../musicScore.ts';
import type { TeaEvent, TeaFrame, TeaRun } from '../../shared/tea.ts';

interface TeaAudioInput {
  view: 'street' | 'prep' | 'play' | 'report';
  run: TeaRun | null;
  frame: TeaFrame | null;
  shopLevel: number;
  teamKey: string;
}

type TeaSound = typeof sound & {
  setMusicScene?: (scene: MusicScene) => void;
  play(cue: TeaSoundCue, options?: { key?: string }): boolean;
};
const audio = sound as TeaSound;

const MAX_DEDUPE = 64;
const reportsPlayed = new Set<string>();

function remember(set: Set<string>, key: string) {
  set.add(key);
  if (set.size <= MAX_DEDUPE) return;
  const oldest = set.values().next().value;
  if (oldest !== undefined) set.delete(oldest);
}

function frameCue(event: TeaEvent): TeaSoundCue | null {
  switch (event.type) {
    case 'order_started': return 'tea_order';
    case 'making_started': return 'tea_pour';
    case 'order_fulfilled': return 'tea_serve';
    case 'skill_triggered': return 'tea_skill';
    case 'customer_lost': return event.reason === 'stock' ? 'tea_stock' : null;
    default: return null;
  }
}

function sceneFor(view: TeaAudioInput['view'], frame: TeaFrame | null): MusicScene {
  if (view === 'street') return 'street';
  if (view === 'prep') return 'prep';
  if (view === 'report') return 'report';
  return frame && frame.t >= 60 && frame.t < 150 ? 'rush' : 'business';
}

/** 将已结算回放事件映射为真实音效；音乐与生命周期交给 sound 统一处理。 */
export function useTeaAudio(input: TeaAudioInput): void {
  const { view, run, frame, shopLevel, teamKey } = input;
  const [streetScene,setStreetScene]=useState<MusicScene>('street');
  useEffect(()=>{
    if(view!=='street')return;
    let candidate:MusicScene='street',since=0;
    const sample=()=>{const d=districtAt(rt.me.x,rt.me.z).id;const next:MusicScene=d==='leisure'?'leisure':d==='commerce'?'commerce':'street';
      if(next!==candidate){candidate=next;since=performance.now();}
      if(performance.now()-since>=1200)setStreetScene(next);
    };sample();const id=setInterval(sample,300);return()=>clearInterval(id);
  },[view]);
  const musicScene = useRef<MusicScene | null>(null);
  const runId = useRef<string | null>(null);
  const lastT = useRef(0);
  const level = useRef<number | null>(null);
  const team = useRef<string | null>(null);

  useEffect(() => {
    const desired = view === 'street' ? streetScene : sceneFor(view, frame);
    if (musicScene.current === desired) return;
    musicScene.current = desired;
    audio.setMusicScene?.(desired);
  }, [view, frame?.t, streetScene]);

  useEffect(() => () => {
    musicScene.current = 'silent';
    audio.setMusicScene?.('silent');
  }, []);

  useEffect(() => {
    if (!run) {
      runId.current = null;
      lastT.current = 0;
      return;
    }
    if (runId.current !== run.id) {
      runId.current = run.id;
      lastT.current = frame?.t ?? 0;
      return;
    }
    if (!frame) return;

    const previous = lastT.current;
    const current = frame.t;
    if (current <= previous || current - previous > 4) {
      lastT.current = current;
      return;
    }

    const played = new Set<TeaSoundCue>();
    for (const event of run.result.events) {
      if (event.t <= previous || event.t > current) continue;
      const cue = frameCue(event);
      if (!cue || played.has(cue)) continue;
      played.add(cue);
      audio.play(cue, {
        key: `tea:${run.id}:${event.type}:${event.t}:${event.customerId ?? -1}`,
      });
    }
    lastT.current = current;
  }, [frame, run]);

  useEffect(() => {
    if (view !== 'report' || !run) return;
    const key = `report:${run.id}`;
    if (reportsPlayed.has(key)) return;
    remember(reportsPlayed, key);
    audio.play(run.result.passed ? 'tea_pass' : 'tea_fail', { key: `tea:${key}` });
  }, [run, view]);

  useEffect(() => {
    if (shopLevel <= 0) return;
    if (level.current === null) {
      level.current = shopLevel;
      return;
    }
    if (shopLevel > level.current) {
      audio.play('tea_upgrade', { key: `tea:upgrade:${shopLevel}` });
    }
    level.current = shopLevel;
  }, [shopLevel]);

  useEffect(() => {
    if (!teamKey) return;
    if (team.current === null) {
      team.current = teamKey;
      return;
    }
    if (team.current !== teamKey) {
      team.current = teamKey;
      audio.play('hire', { key: `tea:hire:${teamKey}` });
    }
  }, [teamKey]);
}
