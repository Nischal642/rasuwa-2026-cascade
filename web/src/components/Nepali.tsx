// A short summary in Nepali for readers in the affected districts. Numbers and times come from the same outputs as the
// English page; only the words are written here.
import { ne, pct } from "@/lib/format";
import { SMS_LEAD, leadtime } from "@/lib/results";

const PLACES: Record<string, string> = {
  Rasuwagadhi: "रसुवागढी",
  Timure: "टिमुरे",
  Syabrubesi: "स्याफ्रुबेसी",
  "Chilime Hydropower Powerhouse": "चिलिमे जलविद्युत् गृह",
  "Upper Trishuli 3A": "माथिल्लो त्रिशूली ३ए",
  "Upper Trishuli-3B Powerhouse": "माथिल्लो त्रिशूली ३बी विद्युत् गृह",
  Betrawati: "बेत्रावती",
  "Trishuli Hydropower Station": "त्रिशूली जलविद्युत् केन्द्र",
  "Trishuli Bridge": "त्रिशूली पुल, विदुर",
};

export default function Nepali({ total, destroyedShare, autoRange }: { total: number; destroyedShare: number; autoRange: [number, number] }) {
  const lt = leadtime.places;
  return (
    <section id="nepali" className="station" lang="ne" aria-labelledby="h-nepali">
      <div className="station-head"><h2 id="h-nepali">नेपालीमा सारांश</h2></div>
      <div className="prose">
        <p className="lede">
          २०८३ भदौ १० गते (२६ अगस्ट २०२६) बिहान ८:३७ बजे लाङटाङ लिरुङ हिमालको उत्तरी भागमा चट्टान र हिउँको ठूलो पहिरो खस्यो।
          त्यो लेदो र बाढी बनेर लेन्दे खोला, भोटेकोशी र त्रिशूली हुँदै करिब ८० किलोमिटर बग्यो। यसलाई रसुवा बाढी वा भोटेकोशी बाढी
          पनि भनिन्छ।
        </p>
        <p>
          बाढीको अग्रभाग बिहान {ne(lt["Syabrubesi"].arrival_npt.replace(/^0/, ""))} मा स्याफ्रुबेसी पुग्यो, तर राष्ट्रिय एसएमएस चेतावनी ९:१५ मा मात्र
          गयो, अर्थात् बाढी पुगेको {ne(SMS_LEAD)} मिनेटपछि। माथिल्लो त्रिशूलीका जलविद्युत् आयोजना र बेत्रावतीमा चेतावनी र बाढी
          लगभग एकै समयमा पुगे। पहिरो खसेको दुई मिनेटभित्र स्वचालित चेतावनी गएको भए ती ठाउँलाई {ne(autoRange[0])} देखि{" "}
          {ne(autoRange[1])} मिनेट समय मिल्न सक्थ्यो।
        </p>
        <p>
          यो अध्ययनले खुला भू-उपग्रह तथ्याङ्क मात्र प्रयोग गरेर बाढीले बदलेको {ne(total.toFixed(1))} वर्ग किलोमिटर क्षेत्र नक्सामा
          उतारेको छ। कोपर्निकसले ध्वस्त भनी छुट्याएका घरमध्ये {ne(pct(destroyedShare).replace(/\s*%$/, ""))} प्रतिशत यही क्षेत्रभित्र
          पर्छन्।
        </p>
      </div>
      <div className="table-wrap" tabIndex={0} style={{ maxWidth: "34rem" }}>
        <table>
          <caption>बाढीको अग्रभाग पुगेको अनुमानित समय (नेपाल समय)</caption>
          <thead><tr><th>ठाउँ</th><th className="r">समय</th><th className="r">एसएमएस चेतावनीको तुलनामा</th></tr></thead>
          <tbody>
            {Object.entries(lt).map(([k, v]) => {
              const m = Math.round(v.after_sms_min);
              return (
                <tr key={k}>
                  <th scope="row">{PLACES[k] ?? k}{v.extrapolated ? " *" : ""}</th>
                  <td className="num r">{ne(v.arrival_npt)}</td>
                  <td className="num r">{m < 0 ? `${ne(-m)} मिनेट अघि` : m > 0 ? `${ne(m)} मिनेट पछि` : "सँगै"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="src" style={{ maxWidth: "var(--measure)" }}>
        * बेत्रावतीभन्दा तलका समय अन्तिम अवलोकनभन्दा पछाडि अनुमान गरिएका हुन्।
      </p>
      <div className="prose">
        <p>
          यो पृष्ठ अनुसन्धानको सारांश हो, आपत्कालीन सूचना होइन। बाढीको हालको पूर्वानुमान र चेतावनीका लागि{" "}
          <a href="https://www.hydrology.gov.np/">जल तथा मौसम विज्ञान विभाग</a> र{" "}
          <a href="https://bipadportal.gov.np/">विपद् पोर्टल</a> हेर्नुहोस्।
        </p>
      </div>
    </section>
  );
}
