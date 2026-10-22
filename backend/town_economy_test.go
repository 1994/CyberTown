package backend

import (
	"sync"
	"testing"
)

func townWorker(h TeaHome, id string) *TeaWorker {
	for i := range h.Workers {
		if h.Workers[i].ID == id {
			return &h.Workers[i]
		}
	}
	return nil
}

func townCandidatePrice(h TownHome, id string) int {
	for _, candidate := range h.Candidates {
		if candidate.ID == id {
			return candidate.Price
		}
	}
	return 0
}

func TestTownEconomyConcurrentHireAndSettlement(t *testing.T) {
	e := setup(t)
	g := e.g
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := g.TownHire("wang", "system-a", 120)
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent hire: %v", err)
		}
	}
	home, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if home.Coins != 1880 || len(home.Clones) != 1 {
		t.Fatalf("concurrent hire paid or cloned twice: %+v", home)
	}
	var demand int
	if err = g.DB.QueryRow("SELECT hires FROM town_clone_demand WHERE source_id='system-a'").Scan(&demand); err != nil || demand != 1 {
		t.Fatalf("demand=%d err=%v", demand, err)
	}

	if _, err = g.TownEnter("li", "li"); err != nil {
		t.Fatal(err)
	}
	li, err := g.TownHire("li", "system-a", 150)
	if err != nil {
		t.Fatal(err)
	}
	if li.Coins != 1850 || len(li.Clones) != 1 || li.Clones[0].HiredPrice != 150 {
		t.Fatalf("second owner price/clone: %+v", li)
	}
	if err = g.DB.QueryRow("SELECT hires FROM town_clone_demand WHERE source_id='system-a'").Scan(&demand); err != nil || demand != 2 {
		t.Fatalf("global demand=%d err=%v", demand, err)
	}

	if _, err = g.TownStartJob("wang", "system-a", "clean"); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	var settle sync.WaitGroup
	settleErrs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		settle.Add(1)
		go func() {
			defer settle.Done()
			_, err := g.TownHome("wang", "wang")
			settleErrs <- err
		}()
	}
	settle.Wait()
	close(settleErrs)
	for err := range settleErrs {
		if err != nil {
			t.Fatalf("concurrent settle: %v", err)
		}
	}
	final, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if final.Coins != 1916 || len(final.Clones) != 1 || final.Clones[0].XP != 60 {
		t.Fatalf("elapsed cycles paid wrong: %+v", final)
	}
	var cycles, earned int
	if err = g.DB.QueryRow("SELECT cycles,earned FROM town_jobs WHERE owner_id='wang' AND source_id='system-a' AND status='active'").Scan(&cycles, &earned); err != nil {
		t.Fatal(err)
	}
	if cycles != 3 || earned != 36 {
		t.Fatalf("job cycles=%d earned=%d", cycles, earned)
	}
	if again, err := g.TownHome("wang", "wang"); err != nil || again.Coins != final.Coins {
		t.Fatalf("settlement replayed: %v %+v", err, again)
	}
}

func TestTownEconomyRollbackAndStaffing(t *testing.T) {
	e := setup(t)
	g := e.g
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownHire("wang", "system-a", 120); err != nil {
		t.Fatal(err)
	}
	lv1, err := g.TeaHome("wang")
	if err != nil {
		t.Fatal(err)
	}
	if townWorker(lv1, "system-a") != nil {
		t.Fatal("Lv1 clone entered store staffing")
	}
	if _, err = g.TownStartJob("wang", "system-a", "clean"); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	grown, err := g.TownHome("wang", "wang")
	if err != nil || grown.Clones[0].XP != 60 || !grown.Clones[0].CanStaff {
		t.Fatalf("clone did not grow to Lv2: %v %+v", err, grown.Clones)
	}
	if _, err = g.TownStartJob("wang", "system-a", "rest"); err != nil {
		t.Fatal(err)
	}
	idle, err := g.TeaHome("wang")
	if err != nil || townWorker(idle, "system-a") == nil {
		t.Fatalf("Lv2 idle clone missing from staffing: %v", err)
	}

	working, err := g.TownStartJob("wang", "system-a", "clean")
	if err != nil || working.Clones[0].Job == nil {
		t.Fatal(err)
	}
	firstJob := working.Clones[0].Job.ID
	if busy, err := g.TeaHome("wang"); err != nil || townWorker(busy, "system-a") != nil {
		t.Fatalf("working clone still staffed: %v", err)
	}
	retry, err := g.TownStartJob("wang", "system-a", "clean")
	if err != nil || retry.Clones[0].Job == nil || retry.Clones[0].Job.ID != firstJob {
		t.Fatal("same-kind retry reset the job", err)
	}

	beforeCoins, _ := g.TeaHome("wang")
	var beforeXP, beforeEnds, beforeCycles, beforeEarned int
	if err = g.DB.QueryRow("SELECT xp FROM town_clones WHERE owner_id='wang' AND source_id='system-a'").Scan(&beforeXP); err != nil {
		t.Fatal(err)
	}
	if err = g.DB.QueryRow("SELECT ends_at,cycles,earned FROM town_jobs WHERE id=?", firstJob).Scan(&beforeEnds, &beforeCycles, &beforeEarned); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	if _, err = g.DB.Exec(`CREATE TRIGGER town_job_fail BEFORE INSERT ON ledger
		WHEN NEW.reason='town_job' BEGIN SELECT RAISE(ABORT,'injected town ledger failure'); END`); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownHome("wang", "wang"); err == nil {
		t.Fatal("injected ledger failure was swallowed")
	}
	var afterXP, afterEnds, afterCycles, afterEarned int
	if err = g.DB.QueryRow("SELECT xp FROM town_clones WHERE owner_id='wang' AND source_id='system-a'").Scan(&afterXP); err != nil {
		t.Fatal(err)
	}
	if err = g.DB.QueryRow("SELECT ends_at,cycles,earned FROM town_jobs WHERE id=?", firstJob).Scan(&afterEnds, &afterCycles, &afterEarned); err != nil {
		t.Fatal(err)
	}
	if afterXP != beforeXP || afterEnds != beforeEnds || afterCycles != beforeCycles || afterEarned != beforeEarned {
		t.Fatalf("partial settlement: xp %d/%d ends %d/%d cycles %d/%d earned %d/%d",
			afterXP, beforeXP, afterEnds, beforeEnds, afterCycles, beforeCycles, afterEarned, beforeEarned)
	}
	if now, _ := g.TeaHome("wang"); now.Coins != beforeCoins.Coins {
		t.Fatalf("wallet changed after rollback: %d -> %d", beforeCoins.Coins, now.Coins)
	}
	if _, err = g.DB.Exec("DROP TRIGGER town_job_fail"); err != nil {
		t.Fatal(err)
	}
	paid, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if paid.Coins != beforeCoins.Coins+36 || paid.Clones[0].XP != beforeXP+60 {
		t.Fatalf("retry did not pay exactly once: %+v", paid)
	}
	if again, err := g.TownHome("wang", "wang"); err != nil || again.Coins != paid.Coins {
		t.Fatal("successful retry replayed", err)
	}

	if _, err = g.TownStartJob("wang", "system-a", "rest"); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TeaAcceptMission("wang"); err != nil {
		t.Fatal(err)
	}
	plan := TeaPlan{Assignments: []TeaAssignment{{WorkerID: "self", Role: "support"}, {WorkerID: "system-a", Role: "maker"}}, Stock: 20, Strategy: "balanced"}
	if _, err = g.TeaOpen("wang", TeaOpenSession{Plan: plan, Lesson: "rescue", Mode: "practice", Key: "town-staffing"}); err != nil {
		t.Fatal(err)
	}
	if _, err = g.TownStartJob("wang", "system-a", "clean"); err == nil {
		t.Fatal("clone on active shop shift started chores")
	} else if gameErr, ok := err.(*GameError); !ok || gameErr.Code != "TOWN_BUSY" {
		t.Fatalf("unexpected shop-busy error: %v", err)
	}
}

func TestTownEconomyReopenPersistenceAndOfflineCap(t *testing.T) {
	e := setup(t)
	g := e.g
	if _, err := g.TownEnter("wang", "wang"); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownHire("wang", "system-a", 120); err != nil {
		t.Fatal(err)
	}
	if _, err := g.TownStartJob("wang", "system-a", "clean"); err != nil {
		t.Fatal(err)
	}
	e.clock.Add(60000)
	first, err := g.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if first.Clones[0].XP != 60 || first.Clones[0].HiredPrice != 120 || first.Clones[0].Job == nil {
		t.Fatalf("pre-reopen clone: %+v", first.Clones[0])
	}
	if price := townCandidatePrice(first, "system-a"); price != 150 {
		t.Fatalf("candidate price=%d", price)
	}

	path := databasePath(t, g)
	e.app.Close()
	e.server.Close()
	if err = g.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path, e.clock.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	before, err := reopened.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if before.Clones[0].XP != 60 || before.Clones[0].HiredPrice != 120 || before.Clones[0].Job == nil {
		t.Fatalf("reopen lost clone/job/price: %+v", before.Clones[0])
	}
	if price := townCandidatePrice(before, "system-a"); price != 150 {
		t.Fatalf("reopen lost demand price=%d", price)
	}
	var cycles int
	if err = reopened.DB.QueryRow("SELECT cycles FROM town_jobs WHERE owner_id='wang' AND source_id='system-a' AND status='active'").Scan(&cycles); err != nil || cycles != 3 {
		t.Fatalf("reopen job cycles=%d err=%v", cycles, err)
	}

	beforeCoins := before.Coins
	e.clock.Add(12 * 3600000)
	capped, err := reopened.TownHome("wang", "wang")
	if err != nil {
		t.Fatal(err)
	}
	if capped.Coins != beforeCoins+8*3600/20*12 {
		t.Fatalf("8h cap amount=%d want=%d", capped.Coins, beforeCoins+8*3600/20*12)
	}
	if capped.Clones[0].XP != 180 {
		t.Fatalf("offline XP=%d", capped.Clones[0].XP)
	}
	if err = reopened.DB.QueryRow("SELECT cycles FROM town_jobs WHERE owner_id='wang' AND source_id='system-a' AND status='active'").Scan(&cycles); err != nil || cycles != 3+8*3600/20 {
		t.Fatalf("capped cycles=%d err=%v", cycles, err)
	}
	if again, err := reopened.TownHome("wang", "wang"); err != nil || again.Coins != capped.Coins {
		t.Fatal("offline cap replayed", err)
	}
}
