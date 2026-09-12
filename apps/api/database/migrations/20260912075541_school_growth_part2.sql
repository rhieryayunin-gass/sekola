create table public.school_marketing (
 id boolean primary key default true check(id), form_url text, partner_copy text not null default 'Bantu sekolah membangun pengalaman belajar yang lebih terhubung. Diskusikan model kemitraan bersama tim OSEKOLA.',
 whatsapp text not null default '6285110511078' check(whatsapp ~ '^[0-9]{8,16}$'), assessment_version integer not null default 1,
 questions jsonb not null default '[]', updated_at timestamptz not null default now(),
 check(form_url is null or form_url ~ '^https://(forms\.gle/|docs\.google\.com/forms/)')
);
insert into public.school_marketing(id) values(true);
create table public.school_partners (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.users(id),
 name text not null, referral_code text unique not null check(referral_code ~ '^[a-zA-Z0-9-]{4,40}$'),
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.school_leads (
 id uuid primary key default gen_random_uuid(), partner_id uuid references public.school_partners(id),
 school_name text not null check(length(school_name) between 2 and 200), contact_name text not null check(length(contact_name) between 2 and 200),
 email text not null check(length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'), phone text not null check(length(phone) between 7 and 30),
 student_count integer not null check(student_count between 1 and 1000000), answers jsonb not null, assessment_version integer not null,
 score integer not null check(score between 0 and 100), recommended_plan text not null references public.school_plans(code),
 stage text not null default 'NEW' check(stage in ('NEW','CONTACTED','DEMO','PROPOSAL','WON','LOST')),
 deal_amount numeric(16,2) not null default 0 check(deal_amount>=0), notes text,
 consent_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index school_leads_partner_created on public.school_leads(partner_id,created_at desc);
create index school_leads_email_created on public.school_leads(lower(email),created_at desc);
create table public.school_commissions (
 id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.school_partners(id), lead_id uuid not null references public.school_leads(id),
 amount numeric(16,2) not null check(amount>=0), status text not null default 'PENDING' check(status in ('PENDING','RECEIVED')),
 reference text, received_at timestamptz, created_at timestamptz not null default now(),
 check((status='PENDING' and received_at is null) or (status='RECEIVED' and received_at is not null))
);
create index school_commissions_partner on public.school_commissions(partner_id);
do $$ declare t text; begin foreach t in array array['school_marketing','school_partners','school_leads','school_commissions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 end loop; end $$;
grant select on public.school_marketing to anon,authenticated;
create policy marketing_public on public.school_marketing for select to anon,authenticated using(true);

create function school_private.owner() returns boolean language sql stable security definer set search_path='' as $$
 select public.app_has_permission(auth.uid(),'tenants.update_all') and school_private.role(array['OWNER'])
$$;
create function school_private.growth_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare partner uuid; is_owner boolean:=school_private.owner(); begin
 perform school_private.tenant();
 select id into partner from public.school_partners where user_id=auth.uid() and is_active;
 if not is_owner and partner is null then raise exception 'Partner access has not been assigned' using errcode='42501'; end if;
 return jsonb_build_object('owner',is_owner,'partner',(select to_jsonb(p) from public.school_partners p where p.id=partner),
 'partners',case when is_owner then coalesce((select jsonb_agg(to_jsonb(p)) from public.school_partners p),'[]') else '[]'::jsonb end,
 'leads',coalesce((select jsonb_agg(to_jsonb(q)) from (select id,partner_id,school_name,contact_name,email,phone,student_count,score,recommended_plan,stage,deal_amount,notes,created_at from public.school_leads where is_owner or partner_id=partner order by created_at desc limit 1000)q),'[]'),
 'commissions',coalesce((select jsonb_agg(to_jsonb(c)) from public.school_commissions c where is_owner or c.partner_id=partner),'[]'));
end $$;
create function public.school_growth_context() returns jsonb language sql security invoker set search_path='' as $$ select school_private.growth_context() $$;

create function school_private.submit_assessment(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare conf public.school_marketing; answer jsonb; question jsonb; points numeric:=0; weight numeric:=0; score integer; plan text; lead uuid; partner uuid; contact_email text:=lower(trim(payload->>'email')); begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16000 or payload->>'consent' is distinct from 'true' then raise exception 'Contact consent and a valid response are required' using errcode='22023'; end if;
 select * into conf from public.school_marketing where id;
 if jsonb_array_length(conf.questions)<>20 or jsonb_typeof(payload->'answers')<>'array' or jsonb_array_length(payload->'answers')<>20 then raise exception 'Answer all 20 questions' using errcode='22023'; end if;
 -- Bound anonymous storage and avoid duplicate contact submissions. The advisory
 -- lock covers count+insert; no caller-chosen role or score is trusted.
 perform pg_advisory_xact_lock(74823651);
 if (select count(*) from public.school_leads where created_at>now()-interval '1 day')>=300 or exists(select 1 from public.school_leads l where lower(l.email)=contact_email and l.created_at>now()-interval '1 day') then raise exception 'Assessment already received or daily limit reached. Contact our team.' using errcode='P0001'; end if;
 for question,answer in select q.value,a.value from jsonb_array_elements(conf.questions) with ordinality q(value,n) join jsonb_array_elements(payload->'answers') with ordinality a(value,n) using(n) loop
 if jsonb_typeof(answer)<>'number' or (answer::text)::numeric<>trunc((answer::text)::numeric) or (answer::text)::integer not between 1 and 5 then raise exception 'Invalid answer' using errcode='22023'; end if;
 points:=points+((answer::text)::integer-1)*(question->>'weight')::numeric/4; weight:=weight+(question->>'weight')::numeric;
 end loop;
 if weight<=0 then raise exception 'Assessment configuration is unavailable'; end if;
 score:=round(points*100/weight); plan:=case when score<=40 then 'ESSENTIAL' when score<=75 then 'ELEVATE' else 'ENTERPRISE' end;
 select id into partner from public.school_partners where referral_code=payload->>'referral_code' and is_active;
 insert into public.school_leads(partner_id,school_name,contact_name,email,phone,student_count,answers,assessment_version,score,recommended_plan)
 values(partner,trim(payload->>'school_name'),trim(payload->>'contact_name'),contact_email,trim(payload->>'phone'),(payload->>'student_count')::integer,payload->'answers',conf.assessment_version,score,plan) returning id into lead;
 return jsonb_build_object('id',lead,'score',score,'plan',plan,'level',case when score<=20 then 'Manual' when score<=40 then 'Digitized' when score<=60 then 'Connected' when score<=80 then 'Smart' else 'Intelligent' end);
end $$;
create function public.school_submit_assessment(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.submit_assessment(payload) $$;

create function school_private.growth_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; partner uuid; is_owner boolean:=school_private.owner(); begin
 perform school_private.tenant();
 select id into partner from public.school_partners where user_id=auth.uid() and is_active;
 if not is_owner and (partner is null or kind<>'lead') then raise exception 'Platform owner required' using errcode='42501'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>50000 then raise exception 'Invalid payload'; end if;
 if kind='lead' then
 update public.school_leads set stage=coalesce(payload->>'stage',stage),deal_amount=coalesce((payload->>'deal_amount')::numeric,deal_amount),notes=coalesce(payload->>'notes',notes),updated_at=now() where id=record_id and (is_owner or partner_id=partner) returning to_jsonb(school_leads.*) into result;
 elsif kind='partner' then
 if record_id is null then insert into public.school_partners(user_id,name,referral_code) values((payload->>'user_id')::uuid,payload->>'name',payload->>'referral_code') returning to_jsonb(school_partners.*) into result;
 else update public.school_partners set name=coalesce(payload->>'name',name),is_active=coalesce((payload->>'is_active')::boolean,is_active) where id=record_id returning to_jsonb(school_partners.*) into result; end if;
 elsif kind='commission' then
 if not exists(select 1 from public.school_leads where id=(payload->>'lead_id')::uuid and partner_id=(payload->>'partner_id')::uuid and stage='WON') then raise exception 'Choose a won deal for this partner'; end if;
 if record_id is null then insert into public.school_commissions(partner_id,lead_id,amount,status,reference,received_at) values((payload->>'partner_id')::uuid,(payload->>'lead_id')::uuid,(payload->>'amount')::numeric,payload->>'status',payload->>'reference',case when payload->>'status'='RECEIVED' then now() else null end) returning to_jsonb(school_commissions.*) into result;
 else update public.school_commissions set status=payload->>'status',reference=payload->>'reference',received_at=case when payload->>'status'='RECEIVED' then now() else null end where id=record_id and partner_id=(payload->>'partner_id')::uuid and lead_id=(payload->>'lead_id')::uuid returning to_jsonb(school_commissions.*) into result; end if;
 elsif kind='plan' then
 if jsonb_typeof(payload->'features')<>'array' or jsonb_array_length(payload->'features')>20 then raise exception 'Invalid plan features'; end if;
 update public.school_plans set price_monthly=(payload->>'price_monthly')::integer,features=payload->'features',offer_note=coalesce(payload->>'offer_note',''),updated_at=now() where code=payload->>'code' returning to_jsonb(school_plans.*) into result;
 elsif kind='marketing' then
 update public.school_marketing set form_url=nullif(payload->>'form_url',''),partner_copy=coalesce(payload->>'partner_copy',partner_copy),whatsapp=coalesce(payload->>'whatsapp',whatsapp),updated_at=now() where id returning to_jsonb(school_marketing.*) into result;
 else raise exception 'Unsupported operation' using errcode='22023'; end if;
 if result is null then raise exception 'Record not found' using errcode='P0002'; end if;
 return result;
end $$;
create function public.school_growth_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.growth_save(kind,payload,record_id) $$;
revoke all on function school_private.owner(),school_private.growth_context(),school_private.submit_assessment(jsonb),school_private.growth_save(text,jsonb,uuid),public.school_growth_context(),public.school_submit_assessment(jsonb),public.school_growth_save(text,jsonb,uuid) from public,anon,authenticated;
grant usage on schema school_private to anon;
grant execute on function school_private.submit_assessment(jsonb),public.school_submit_assessment(jsonb) to anon,authenticated;
grant execute on function school_private.growth_context(),school_private.growth_save(text,jsonb,uuid),public.school_growth_context(),public.school_growth_save(text,jsonb,uuid) to authenticated;
-- Version 1 editable baseline; 20 scenario questions, recovered relative weights; score normalized to 100.
update public.school_marketing set questions=$questions$[{"id":"q1","category":"Data siswa","prompt":"Siswa pindahan mendaftar hari ini. Bagaimana tim menemukan dan memperbarui datanya?","options":["Mencari map kertas dan menyalin formulir","Mengubah file spreadsheet masing-masing petugas","Memperbarui satu data yang dipakai lintas bagian","Sistem memeriksa duplikasi dan memberi tahu bagian terkait","Data tervalidasi dan membantu merencanakan kebutuhan layanan"],"weight":6},{"id":"q2","category":"Perencanaan akademik","prompt":"Saat tahun ajaran baru dimulai, bagaimana kelas dan pembagian guru disiapkan?","options":["Menyusun daftar di kertas","Menggabungkan banyak file dari tiap koordinator","Menyusun kelas, guru dan semester di sistem bersama","Sistem memeriksa benturan jadwal dan kapasitas","Sekolah memakai proyeksi kebutuhan untuk menyusun skenario"],"weight":5},{"id":"q3","category":"Presensi","prompt":"Seorang siswa belum hadir pada pelajaran pertama. Apa yang terjadi?","options":["Guru mencatat dan menghubungi keluarga secara terpisah","Catatan dipindah ke spreadsheet setelah kelas","Presensi langsung dapat dilihat pihak yang berwenang","Pemberitahuan dan tindak lanjut berjalan sesuai aturan","Pola ketidakhadiran dipakai untuk intervensi yang dievaluasi"],"weight":4},{"id":"q4","category":"Materi belajar","prompt":"Guru pengganti perlu melanjutkan materi kelas besok. Bagaimana ia mendapatkannya?","options":["Meminta buku atau catatan guru sebelumnya","Mencari file di chat atau folder pribadi","Membuka materi sesuai course dan lesson pada sistem","Materi, tugas dan progres kelas saling terhubung","Progres belajar membantu memilih materi lanjutan yang tepat"],"weight":7},{"id":"q5","category":"Tugas","prompt":"Orang tua bertanya tugas apa yang belum dikumpulkan anaknya. Bagaimana menjawabnya?","options":["Menanyakan satu per satu kepada guru","Mencocokkan file tugas dan daftar nilai","Membuka daftar tugas dan pengumpulan anak tersebut","Sistem menampilkan tenggat dan mengirim pengingat","Sekolah menilai pola keterlambatan dan efektivitas bantuan"],"weight":4},{"id":"q6","category":"Penilaian","prompt":"Tim guru ingin menggunakan kembali soal yang berkualitas. Bagaimana caranya?","options":["Membongkar berkas ujian cetak lama","Mencari file soal di komputer masing-masing","Memilih dari bank soal yang dikelompokkan menurut pelajaran","Soal melewati tinjauan dan analisis hasil pemakaian","Data kualitas soal mendukung perbaikan instrumen secara rutin"],"weight":5},{"id":"q7","category":"Pelaksanaan ujian","prompt":"Banyak kelas memulai ujian secara bersamaan. Bagaimana sekolah menyiapkannya?","options":["Membagikan lembar soal dan mengoreksi manual","Menggunakan formulir daring tanpa latihan beban","Menjadwalkan sesi digital dengan akun dan penyimpanan jawaban","Menguji kapasitas serta pemulihan koneksi sebelum ujian","Memantau indikator layanan dan mengevaluasi ketahanan berkala"],"weight":6},{"id":"q8","category":"Tagihan","prompt":"Orang tua ingin mengetahui rincian tagihan yang belum lunas. Bagaimana ia mendapatkannya?","options":["Menanyakan catatan di loket","Menerima file atau foto yang disusun petugas","Melihat tagihan dan pembayaran yang terhubung","Saldo direkonsiliasi otomatis dengan jejak perubahan","Tren pembayaran dipakai untuk perencanaan dan layanan yang adil"],"weight":5},{"id":"q9","category":"Laporan keuangan","prompt":"Pimpinan meminta posisi keuangan sekolah sore ini. Bagaimana laporan disiapkan?","options":["Mengumpulkan buku catatan dari beberapa meja","Menggabungkan spreadsheet dan menghitung ulang","Menarik laporan dari pencatatan transaksi bersama","Memeriksa pengecualian lewat laporan dan persetujuan terintegrasi","Membandingkan proyeksi dengan realisasi untuk mengambil tindakan"],"weight":5},{"id":"q10","category":"Komunikasi","prompt":"Guru perlu menghubungi orang tua yang berhak atas informasi seorang siswa. Apa alurnya?","options":["Mencari nomor di daftar cetak","Mencari kontak dari banyak grup chat","Menghubungi akun orang tua yang terhubung ke siswa","Percakapan terkait kelas atau tugas dengan akses yang jelas","Sekolah mengevaluasi keterjangkauan dan efektivitas komunikasi"],"weight":5},{"id":"q11","category":"Kalender","prompt":"Jadwal acara sekolah berubah. Bagaimana semua pihak mengetahui perubahan tersebut?","options":["Mencetak pengumuman baru","Mengirim ulang pesan di beberapa grup","Mengubah satu kalender sekolah yang dapat diakses bersama","Kalender memberi notifikasi dan meminta respons peserta","Kehadiran dan benturan agenda dievaluasi untuk perencanaan"],"weight":7},{"id":"q12","category":"Proyek sekolah","prompt":"Panitia kegiatan perlu tahu pekerjaan yang terlambat. Bagaimana memantaunya?","options":["Bertanya saat rapat","Mengirim daftar pekerjaan di spreadsheet atau chat","Melihat papan tugas dengan PIC dan tenggat","Ketergantungan, anggaran dan persetujuan mengikuti proyek","Data pelaksanaan dipakai memperbaiki template kegiatan"],"weight":6},{"id":"q13","category":"Aset","prompt":"Dua guru ingin memakai laboratorium pada jam yang sama. Apa yang dilakukan?","options":["Memeriksa buku peminjaman lalu berkoordinasi","Memeriksa tabel jadwal yang dibagikan manual","Mencari ketersediaan pada sistem pemesanan bersama","Sistem menolak benturan dan memproses persetujuan","Pemakaian dan kapasitas membantu keputusan investasi aset"],"weight":5},{"id":"q14","category":"Akses pengguna","prompt":"Seorang pegawai berhenti bekerja. Bagaimana aksesnya ditangani?","options":["Mengandalkan penggantian kata sandi bersama","Mencabut akses aplikasi satu per satu dari catatan","Menonaktifkan akun dengan peran yang terdaftar","Prosedur pencabutan dan audit lintas modul terintegrasi","Peninjauan akses berkala menguji dan memperbaiki pengendalian"],"weight":4},{"id":"q15","category":"Keamanan data","prompt":"Sekolah perlu memulihkan informasi penting yang terhapus. Apa persiapannya?","options":["Tidak ada salinan yang teratur","Salinan dibuat sesekali pada perangkat lain","Cadangan terjadwal dan penanggung jawab sudah jelas","Pemulihan diuji dengan batas waktu dan jejak audit","Hasil latihan pemulihan dipakai mengurangi risiko secara berkala"],"weight":4},{"id":"q16","category":"Layanan orang tua","prompt":"Orang tua mempunyai pertanyaan tentang perkembangan anak. Apa pengalaman layanannya?","options":["Harus datang dan menghubungi tiap bagian","Bertukar pesan di beberapa saluran terpisah","Satu akses menampilkan informasi anak yang relevan","Pertanyaan terhubung ke data dan tindak lanjut petugas","Umpan balik dan waktu penyelesaian memandu perbaikan layanan"],"weight":4},{"id":"q17","category":"Pengambilan keputusan","prompt":"Pimpinan ingin mengetahui kelas yang perlu dukungan tambahan. Apa dasar keputusannya?","options":["Kesan rapat dan cerita informal","Laporan rekap yang disiapkan sesekali","Data akademik dan kehadiran tersedia pada dashboard","Indikator lintas data menghasilkan tindak lanjut terukur","Sekolah menguji dampak intervensi dan memperbaiki strateginya"],"weight":7},{"id":"q18","category":"Pengembangan guru","prompt":"Fitur digital baru diluncurkan. Bagaimana guru didampingi?","options":["Belajar sendiri tanpa panduan","Mendapat satu sesi pengenalan","Mendapat panduan, pelatihan dan saluran bantuan","Pemakaian serta kendala dievaluasi dengan pendampingan","Komunitas guru berbagi praktik dan mengukur dampak pembelajaran"],"weight":4},{"id":"q19","category":"Integrasi","prompt":"Nama seorang siswa dikoreksi. Di mana perubahan perlu dilakukan?","options":["Di setiap dokumen cetak","Di beberapa file dan aplikasi secara manual","Pada satu data induk yang dibaca modul lain","Validasi dan sinkronisasi mencegah perbedaan data","Kualitas data dipantau dan proses integrasi dievaluasi rutin"],"weight":4},{"id":"q20","category":"Arah transformasi","prompt":"Sekolah merencanakan investasi digital tahun depan. Bagaimana prioritas dipilih?","options":["Mengikuti kebutuhan mendadak","Membeli alat yang sedang populer","Memakai peta kebutuhan dan target sekolah","Membandingkan manfaat, biaya dan kesiapan proses","Mengukur hasil investasi dan menyesuaikan peta jalan berdasarkan bukti"],"weight":2}]$questions$::jsonb where id;
