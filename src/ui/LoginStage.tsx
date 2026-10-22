import type { ReactNode } from 'react';
import './login.css';

/** A small cartoon street set, framing the playable identity controls. */
function EntryStreet() {
  return <svg className="entry-street" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="entrySky" x2="0" y2="1"><stop stopColor="#25204d"/><stop offset="1" stopColor="#67436c"/></linearGradient>
      <linearGradient id="entryRoad" x2="0" y2="1"><stop stopColor="#413759"/><stop offset="1" stopColor="#202e48"/></linearGradient>
      <pattern id="entryWindows" width="46" height="56" patternUnits="userSpaceOnUse"><rect x="12" y="12" width="16" height="25" rx="3" fill="#9d7fc5" opacity=".35"/></pattern>
    </defs>
    <rect width="1440" height="900" fill="url(#entrySky)"/>
    <circle cx="1160" cy="142" r="64" fill="#f8c989" opacity=".9"/><circle cx="1135" cy="124" r="64" fill="#30264f"/>
    <g fill="#372f5c" stroke="#272942" strokeWidth="7" strokeLinejoin="round">
      <path d="M-20 500V192H94V127H159V210H224V520M220 520V280H300V184H358V520M1090 510V230H1170V181H1250V520M1270 530V236H1340V155H1460V540"/>
    </g>
    <path d="M0 510V240H220V520H300V230H358V520H1090V260H1250V520H1320V210H1440V550Z" fill="url(#entryWindows)"/>
    <path d="M0 620L720 440L1440 620V900H0Z" fill="url(#entryRoad)" stroke="#272942" strokeWidth="8"/>
    <path d="M0 760L720 530L1440 760M0 850L720 590L1440 850" fill="none" stroke="#6994a4" strokeWidth="3" opacity=".3"/>
    <path d="M0 795L565 590M875 590L1440 795" stroke="#62e8d4" strokeWidth="8" opacity=".65"/>
    <g stroke="#20243e" strokeWidth="8" strokeLinejoin="round">
      <path d="M48 640V378L283 324L414 395V640L190 715Z" fill="#72568e"/>
      <path d="M283 324V591L414 640V395Z" fill="#493f6d"/>
      <path d="M48 378L283 324L414 395L181 452Z" fill="#a886ad"/>
      <path d="M39 450L279 396L292 452L50 510Z" fill="#f09ca4"/>
      <path d="M279 396L421 458L414 512L292 452Z" fill="#ad608f"/>
      <path d="M77 532L174 510V661L77 685Z" fill="#2c4b64"/>
      <path d="M200 506L265 491V609L200 627Z" fill="#81ded3"/>
      <path d="M88 559L162 540M88 594L162 575" stroke="#64b6c0" strokeWidth="5"/>
      <path d="M79 364V303L245 265V327Z" fill="#ffe188"/>
      <path d="M97 317L227 289M97 338L195 316" stroke="#b58479" strokeWidth="6"/>
      <path d="M1020 620V378L1212 329L1392 403V681L1209 725Z" fill="#557b91"/>
      <path d="M1212 329V725L1392 681V403Z" fill="#38536e"/>
      <path d="M1006 379L1210 319L1405 396L1208 454Z" fill="#84b7bc"/>
      <path d="M1049 486L1180 523V655L1049 618Z" fill="#f4b58e"/>
      <path d="M1242 504L1355 476V603L1242 632Z" fill="#57c5c8"/>
      <path d="M1060 389V326L1180 353V418Z" fill="#e19cca"/>
      <path d="M1077 350L1163 370M1077 371L1139 386" stroke="#7f477d" strokeWidth="6"/>
      <path d="M1110 325V263" stroke="#77e6db" strokeWidth="12"/>
      <ellipse cx="1110" cy="242" rx="43" ry="24" fill="#fee58d" transform="rotate(15 1110 242)"/>
    </g>
    <g stroke="#20243e" strokeWidth="7" strokeLinejoin="round">
      <path d="M320 728V582M315 586L377 568V598" fill="none"/><path d="M359 598H393L400 621H352Z" fill="#ffe99a"/>
      <path d="M995 740V596M989 600L934 582V610" fill="none"/><path d="M917 610H949L957 633H909Z" fill="#ffe99a"/>
      <ellipse cx="184" cy="782" rx="64" ry="21" fill="#18263d" opacity=".4"/>
      <path d="M153 738L207 738L218 776L145 776Z" fill="#e49ca7"/>
      <path d="M181 741V687" fill="none"/>
      <path d="M140 692L152 648L184 631L218 650L226 691L185 717Z" fill="#74c6b1"/>
      <path d="M1240 770H1310V812H1240Z" fill="#b98bad"/><path d="M1242 766L1225 724L1250 700L1275 735L1293 690L1320 716L1308 771Z" fill="#7bc7ba"/>
    </g>
    <g fill="#f7e3aa"><path d="M370 146l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"/><circle cx="988" cy="107" r="3"/><circle cx="250" cy="104" r="3"/><circle cx="1050" cy="192" r="3"/></g>
  </svg>;
}
export function LoginStage({ children, confirmed = false }: { children: ReactNode; confirmed?: boolean }) {
  return <main className="town-entry">
    <EntryStreet/>
    <div className="entry-frame">
      <header className="entry-brand"><span className="entry-logo-tab">CYBER TOWN</span><h1>赛博<span>小镇</span></h1><div className="entry-logo-bolts" aria-hidden="true"><i/><i/></div></header>
      <section className={`entry-panel ${confirmed?'is-confirmed':''}`} aria-label={confirmed?'确认进入小镇':'登录小镇'}>
        <i className="entry-screw screw-left" aria-hidden="true"/><i className="entry-screw screw-right" aria-hidden="true"/>
        {children}
      </section>
      <span className="entry-demo">DEMO</span>
    </div>
  </main>;
}
