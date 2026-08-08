import { AgentConfig, KnowledgeSource, ProductItem, WidgetSettings } from '../types';

export const defaultAgentConfig: AgentConfig = {
  id: 'agent_default',
  name: 'Trợ Lý AI',
  title: 'Chuyên viên Tư Vấn & Hỗ Trợ Khách Hàng',
  avatarUrl: 'https://bizweb.dktcdn.net/100/460/752/files/them_logo_tren_ao_co_202606181532.jpeg?v=1786018615920',
  greetingMessage: 'Xin chào! Tôi là Trợ lý AI tư vấn. Tôi có thể giải đáp thắc mắc, tư vấn sản phẩm, dịch vụ và hỗ trợ nghiệp vụ cho bạn. Bạn cần hỗ trợ thông tin gì ạ?',
  tone: 'friendly',
  businessName: 'Doanh Nghiệp AI',
  businessIndustry: 'Thương mại & Dịch vụ',
  businessDescription: 'Chuyên cung cấp các giải pháp, sản phẩm và dịch vụ chất lượng cao cho khách hàng.',
  clarificationEnabled: true,
  clarificationStyle: 'polite',
  primaryLanguage: 'Vietnamese',
  selectedProvider: 'google',
  selectedModel: 'gemini-3.6-flash',
  customApiKey: '',
  customApiEndpoint: '',
  providerApiKeys: {},
  providerEndpoints: {},
  temperature: 0.7,
};

export const defaultKnowledgeSources: KnowledgeSource[] = [
  {
    id: 'kb_1',
    title: 'Website TechLife - Giới thiệu & Chính sách chung',
    type: 'website',
    url: 'https://techlife.vn/about-and-policies',
    content: `Chào mừng đến với TechLife Việt Nam.
Thời gian làm việc hỗ trợ: 8:00 - 21:30 tất cả các ngày trong tuần.
Hotline tổng đài: 1900 6868 - Email: cskh@techlife.vn
Chính sách giao hàng: Miễn phí vận chuyển toàn quốc cho đơn hàng từ 500.000 VNĐ. Giao hàng hoả tốc nội thành Hà Nội & TP.HCM trong 2 giờ.
Chính sách bảo hành: Tất cả sản phẩm chính hãng bảo hành 12 tháng 1 đổi 1 trong 30 ngày đầu nếu có lỗi từ nhà sản xuất.
Phương thức thanh toán: Tiền mặt COD, Chuyển khoản ngân hàng, VNPay QR, Trả góp 0% qua thẻ tín dụng.`,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    active: true,
    wordCount: 120,
  },
  {
    id: 'kb_2',
    title: 'Quy trình xử lý sự cố & Hướng dẫn nghiệp vụ đổi trả',
    type: 'process_guide',
    content: `QUY TRÌNH NGHIỆP VỤ HỖ TRỢ ĐỔI TRẢ & BẢO HÀNH KHÁCH HÀNG:
1. Tiếp nhận thông tin lỗi từ khách hàng:
   - Yêu cầu khách hàng cung cấp Số điện thoại đặt hàng hoặc Mã đơn hàng.
   - Yêu cầu hình ảnh/video mô tả tình trạng lỗi của thiết bị.
2. Hướng dẫn khắc phục sự cố tại chỗ (Troubleshooting):
   - Đối với thiết bị không lên nguồn: Kiểm tra cắm sạc ít nhất 15 phút, thử ổ cắm khác.
   - Đối với thiết bị kết nối Wi-Fi/Bluetooth hỏng: Reset thiết bị giữ nút Power 10 giây cho đến khi đèn nháy đỏ, sau đó kết nối lại ứng dụng TechLife App.
3. Tạo phiếu bảo hành / Đổi mới:
   - Trong 30 ngày đầu lỗi NSX: Đổi sản phẩm mới nguyên seal tận nhà không mất phí.
   - Sau 30 ngày: Gửi về trung tâm bảo hành gần nhất hoặc shipper qua lấy máy miễn phí.`,
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    active: true,
    wordCount: 160,
  },
  {
    id: 'kb_3',
    title: 'Cẩm nang hướng dẫn sử dụng Robot hút bụi TechLife Pro X',
    type: 'document',
    content: `HƯỚNG DẪN SỬ DỤNG VÀ BẢO TRÌ ROBOT HÚT BỤI TECHLIFE PRO X:
- Lần đầu sử dụng: Sạc đầy pin 4-6 tiếng trước khi cho robot quét bản đồ nhà lần đầu.
- Vị trí đặt dock sạc: Đặt dock sạc sát tường, cách hai bên 0.5m và phía trước 1.5m không có vật cản.
- Sử dụng nước lau sàn: Chỉ dùng nước sạch hoặc nước lau sàn chuyên dụng TechLife Clean. KHÔNG dùng xà phòng thông thường hay giấm vì gây nghẹt van bơm tự động.
- Vệ sinh định kỳ:
  + Đổ hộp rác & giặt giẻ lau sau mỗi lần dọn dẹp (hoặc chọn mode tự giặt giẻ đối với model Ultra).
  + Tóc quấn ở chổi chính: Dùng dao cắt tóc đi kèm cắt bỏ tóc cuộn 1 lần/tuần.
  + Cảm biến chống rơi: Dùng khăn khô mềm lau nhẹ 4 mắt cảm biến bên dưới gầm robot 2 tuần/lần.`,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
    wordCount: 180,
  }
];

export const defaultProducts: ProductItem[] = [
  {
    id: 'prod_1',
    name: 'Robot Hút Bụi Lau Nhà TechLife Pro X',
    category: 'Robot Hút Bụi',
    price: 8990000,
    originalPrice: 10990000,
    description: 'Robot thông minh lực hút 6000Pa, định vị Laser LiDAR 4.0, tự động giặt giẻ lau và sấy khô bằng khí nóng.',
    keyFeatures: [
      'Lực hút cực mạnh 6000Pa hút sạch bụi mịn',
      'Công nghệ Laser LiDAR quét bản đồ 3D cực chính xác',
      'Trạm sạc đa năng tự giặt giẻ & sấy khô giẻ lau',
      'Kết nối ứng dụng điện thoại tiếng Việt'
    ],
    idealFor: 'Căn hộ chung cư, nhà phố diện tích từ 70m2 - 180m2, gia đình có nuôi thú cưng hoặc trẻ nhỏ.',
    usageInstructions: 'Tải ứng dụng TechLife, bật định vị Bluetooth & Wi-Fi 2.4GHz trên điện thoại, quét mã QR dưới nắp robot để gán thiết bị.',
    imageUrl: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=400&auto=format&fit=crop&q=80',
    inStock: true
  },
  {
    id: 'prod_2',
    name: 'Tai Nghe Bluetooth TechLife SoundBuds Pro',
    category: 'Âm thanh',
    price: 1490000,
    originalPrice: 1890000,
    description: 'Tai nghe True Wireless chống ồn chủ động ANC -42dB, pin 32 giờ liên tục, âm bass trầm sâu chuẩn Hi-Res Audio.',
    keyFeatures: [
      'Chống ồn chủ động ANC đỉnh cao',
      'Thời lượng pin tới 8h (kèm hộp sạc 32h)',
      'Kháng nước IPX5 chống mồ hôi khi tập thể thao',
      'Micro AI lọc tiếng ồn đàm thoại rõ nét'
    ],
    idealFor: 'Dân văn phòng hay họp online, người đi chuyển tàu xe, tập gym và yêu thích âm nhạc chất lượng cao.',
    usageInstructions: 'Mở nắp hộp tai nghe, giữ nút phía sau hộp 3 giây cho đèn trắng chớp tắt, chọn TechLife SoundBuds Pro trên Bluetooth điện thoại.',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80',
    inStock: true
  },
  {
    id: 'prod_3',
    name: 'Nồi Chiên Không Dầu Điện Tử TechLife AirFryer 7L',
    category: 'Gia dụng bếp',
    price: 2290000,
    originalPrice: 2890000,
    description: 'Nồi chiên không dầu dung tích 7L kính cường lực quan sát thức ăn, 12 chế độ nấu tự động, công nghệ đối lưu 360 độ giảm 85% mỡ thừa.',
    keyFeatures: [
      'Cửa kính trong suốt quan sát trực tiếp',
      'Dung tích lớn 7 Lit chiên nguyên con gà 2.5kg',
      'Màn hình cảm ứng OLED tiếng Việt',
      'Lòng nồi chống dính Teflon cao cấp không PFOA'
    ],
    idealFor: 'Gia đình từ 3 - 6 người, người thích ăn đồ nướng khoái khẩu nhưng muốn ăn uống lành mạnh hạn chế dầu mỡ.',
    usageInstructions: 'Tráng qua nước ấm trước khi dùng lần đầu. Chọn chế độ hoặc chỉnh nhiệt độ 80-200 độ C, hẹn giờ tự ngắt.',
    imageUrl: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=400&auto=format&fit=crop&q=80',
    inStock: true
  },
  {
    id: 'prod_4',
    name: 'Camera An Ninh Thông Minh TechLife Cam 360 2K',
    category: 'Nhà thông minh',
    price: 790000,
    originalPrice: 990000,
    description: 'Camera quay quét 360 độ độ phân giải 2K Super HD, đàm thoại 2 chiều, xoay theo chuyển động người AI.',
    keyFeatures: [
      'Xoay ngang 360 độ, xoay dọc 110 độ không góc chết',
      'Hồng ngoại nhìn đêm có màu nét căng',
      'Cảnh báo chuyển động về điện thoại ngay lập tức',
      'Lưu trữ thẻ nhớ MicroSD lên tới 256GB hoặc Cloud'
    ],
    idealFor: 'Gia đình cần giám sát con nhỏ, người già, cửa hàng kinh doanh, hoặc theo dõi nhà khi đi vắng.',
    usageInstructions: 'Cắm nguồn 5V đi kèm, mở ứng dụng TechLife App nhấn thêm thiết bị, đưa mã QR trên màn hình lại gần ống kính camera 15cm.',
    imageUrl: 'https://images.unsplash.com/photo-1557324232-b8917d3c3dcb?w=400&auto=format&fit=crop&q=80',
    inStock: true
  }
];

export const defaultWidgetSettings: WidgetSettings = {
  primaryColor: '#2563eb', // royal blue
  headerTitle: 'Hỗ Trợ Khách Hàng AI',
  subtitle: 'Trả lời tự động 24/7 bằng Trợ lý AI',
  position: 'bottom-right',
  buttonText: 'Hỏi Trợ Lý AI',
  showAvatar: true,
  autoOpenDelay: 0,
};
