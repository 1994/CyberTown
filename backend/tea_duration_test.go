package backend

import "testing"

func TestCounterSelectableDuration(t *testing.T) {
	for _, duration := range []int{0, 30, 60} {
		t.Run(string(rune('A'+duration)), func(t *testing.T) {
			e := setup(t)
			g := e.g
			if _, err := g.TeaAcceptMission("wang"); err != nil {
				t.Fatal(err)
			}
			plan, _ := counterPlan(false)
			input := TeaOpenSession{Plan: plan, Lesson: "rescue", Mode: "official", Key: "duration", Duration: duration}
			s, err := g.TeaOpen("wang", input)
			if err != nil {
				t.Fatal(err)
			}
			want := duration
			if want == 0 {
				want = 30
			}
			if s.Run.Challenge.Duration != want {
				t.Fatal("duration not frozen", s.Run.Challenge.Duration)
			}
			retry, err := g.TeaOpen("wang", input)
			if err != nil || retry.ID != s.ID {
				t.Fatal("retry changed round", err)
			}
			changed := input
			if want == 30 {
				changed.Duration = 60
			} else {
				changed.Duration = 30
			}
			if _, err = g.TeaOpen("wang", changed); err == nil {
				t.Fatal("reused key changed duration")
			}
			step := TeaStep{Revision: s.Revision, Advance: want - 1, RequestID: "almost"}
			s, err = g.TeaStepSession("wang", s.ID, step)
			if err != nil || s.Status != "active" {
				t.Fatal("ended early", err)
			}
			step = TeaStep{Revision: s.Revision, Advance: 1, RequestID: "finish"}
			s, err = g.TeaStepSession("wang", s.ID, step)
			if err != nil || s.Status == "active" || s.T != want {
				t.Fatal("wrong settlement time", err)
			}
			again, err := g.TeaStepSession("wang", s.ID, step)
			if err != nil || again.Run.CoinsAfter != s.Run.CoinsAfter {
				t.Fatal("settlement retry", err)
			}
		})
	}
	e := setup(t)
	p, _ := counterPlan(false)
	if _, err := e.g.TeaOpen("wang", TeaOpenSession{Plan: p, Lesson: "rescue", Mode: "practice", Key: "invalid", Duration: 45}); err == nil {
		t.Fatal("accepted unsupported duration")
	}
}
