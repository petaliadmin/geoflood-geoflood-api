import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';

const mockZonesService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  getNearby: jest.fn(),
  getRiskMapOptimized: jest.fn(),
};

describe('ZonesController', () => {
  let controller: ZonesController;

  beforeEach(() => {
    controller = new ZonesController(mockZonesService as unknown as ZonesService);
    jest.clearAllMocks();
  });

  it('should get zones', async () => {
    mockZonesService.findAll.mockResolvedValue([]);
    const result = await controller.getZones({});
    expect(mockZonesService.findAll).toHaveBeenCalled();
    expect(result).toEqual({ zones: [] });
  });

  it('should get nearby zones', async () => {
    mockZonesService.getNearby.mockResolvedValue([]);
    const result = await controller.getNearby({ lat: 14.69, lng: -17.44 });
    expect(mockZonesService.getNearby).toHaveBeenCalledWith(14.69, -17.44, undefined);
    expect(result).toEqual({ zones: [] });
  });

  it('should get risk map', async () => {
    mockZonesService.getRiskMapOptimized.mockResolvedValue([]);
    const result = await controller.getRiskMap({ city: 'Dakar' });
    expect(mockZonesService.getRiskMapOptimized).toHaveBeenCalledWith({ city: 'Dakar' });
    expect(result).toEqual({ zones: [] });
  });

  it('should get zone by id', async () => {
    mockZonesService.findById.mockResolvedValue({ id: 'zone-1' });
    const result = await controller.getZone('zone-1');
    expect(result.id).toBe('zone-1');
  });
});
